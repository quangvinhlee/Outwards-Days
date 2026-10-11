import { z } from "zod";
import { MongoClient } from "mongodb";
import type {
  Destination,
  Preferences,
} from "../../../packages/contracts/src/index.js";

const responseSchema = z.object({
  elements: z
    .array(
      z.object({
        type: z.enum(["node", "way", "relation"]),
        id: z.number().int(),
        lat: z.number().optional(),
        lon: z.number().optional(),
        center: z.object({ lat: z.number(), lon: z.number() }).optional(),
        tags: z.record(z.string(), z.string()).optional(),
      }),
    )
    .max(10000),
});
const photonSchema = z.object({
  features: z.array(z.object({
    properties: z.object({
      name: z.string().optional(),
      osm_id: z.number().int(),
      osm_type: z.enum(["N", "W", "R"]),
      osm_key: z.string().optional(),
      osm_value: z.string().optional(),
    }),
    geometry: z.object({ coordinates: z.tuple([z.number(), z.number()]) }),
  })).max(100),
});
type Element = z.infer<typeof responseSchema>["elements"][number];
const cache = new Map<string, { until: number; places: Destination[] }>();
const pending = new Map<string, Promise<Destination[]>>();
const uniquePlaces = (places: Destination[]) => [...new Map(places.map((place) => [place.id, place])).values()];
let nextPublicRequestAt = 0;
let nextPublicHikeRequestAt = 0;
let mongoClient: Promise<MongoClient> | undefined;
export async function closePlaceCache() {
  const pendingClient = mongoClient;
  mongoClient = undefined;
  if (pendingClient) await (await pendingClient).close();
}
type StoredPlaces = {
  key: string;
  places: Destination[];
  until: Date;
  deleteAt: Date;
};
async function collection() {
  if (!process.env.MONGODB_URI) return undefined;
  mongoClient ??= new MongoClient(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 3000,
  })
    .connect()
    .then(async (client) => {
      const places = client
        .db(process.env.MONGODB_DB || "outsideweek")
        .collection<StoredPlaces>("placeCaches");
      await Promise.all([
        places.createIndex({ key: 1 }, { unique: true }),
        places.createIndex({ deleteAt: 1 }, { expireAfterSeconds: 0 }),
      ]);
      return client;
    });
  try {
    return (await mongoClient)
      .db(process.env.MONGODB_DB || "outsideweek")
      .collection<StoredPlaces>("placeCaches");
  } catch {
    mongoClient = undefined;
    return undefined;
  }
}
async function readStored(key: string) {
  try {
    return await (await collection())?.findOne({ key });
  } catch {
    return undefined;
  }
}
async function writeStored(key: string, places: Destination[]) {
  try {
    await (
      await collection()
    )?.updateOne(
      { key },
      {
        $set: {
          places,
          until: new Date(Date.now() + 6 * 3600000),
          deleteAt: new Date(Date.now() + 30 * 86400000),
        },
      },
      { upsert: true },
    );
  } catch {
    /* Discovery still works without a shared cache. */
  }
}

export function directKm(a: number, b: number, c: number, d: number) {
  const r = Math.PI / 180;
  const h =
    Math.sin(((c - a) * r) / 2) ** 2 +
    Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function routeKm(tag?: string) {
  if (!tag) return undefined;
  const match = tag.trim().match(/^(\d+(?:[.,]\d+)?)\s*(km|mi|m)?$/i);
  if (!match) return undefined;
  const number = Number(match[1].replace(",", "."));
  const km =
    number *
    (match[2]?.toLowerCase() === "mi"
      ? 1.609344
      : match[2]?.toLowerCase() === "m"
        ? 0.001
        : 1);
  return km >= 1 && km <= 30 ? Number(km.toFixed(1)) : undefined;
}
export function fromOsm(
  elements: Element[],
  p: Preferences,
  fetchedAt: string,
): Destination[] {
  if (p.latitude === undefined || p.longitude === undefined) return [];
  const candidates = elements.flatMap((element) => {
    const t = element.tags ?? {};
    const point =
      element.center ??
      (element.lat !== undefined && element.lon !== undefined
        ? { lat: element.lat, lon: element.lon }
        : undefined);
    if (!point || !t.name || t.access === "private" || t.access === "no")
      return [];
    const kind: Destination["kind"] =
      t.route === "hiking"
        ? "hike"
        : t.waterway === "river" || t.water === "river"
          ? "riverside"
          : t.leisure === "park" || t.leisure === "nature_reserve"
            ? "park"
            : t.leisure === "garden" ? "garden"
            : t.place === "square" ? "square"
            : t.tourism === "picnic_site" ? "picnic_site"
            : "other";
    if (kind === "other") return [];
    const distanceKm = Number(
      directKm(p.latitude!, p.longitude!, point.lat, point.lon).toFixed(2),
    );
    if (
      kind === "hike" &&
      !["yes", "true", "1"].includes(t.roundtrip ?? t.circular ?? "")
    )
      return [];
    const length = kind === "hike" ? routeKm(t.distance) : undefined;
    if (kind === "hike" && !length) return [];
    return [
      {
        id: `osm:${element.type}:${element.id}`,
        name: t.name.slice(0, 80),
        url: `https://www.openstreetmap.org/${element.type}/${element.id}`,
        source: "OpenStreetMap",
        fetchedAt,
        kind,
        latitude: point.lat,
        longitude: point.lon,
        distanceKm,
        ...(length ? { routeKm: length } : {}),
      } satisfies Destination,
    ];
  });
  const nearest = (kind: Destination["kind"], limit: number) =>
    candidates
      .filter((place) => place.kind === kind)
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
      .slice(0, limit);
  return [
    ...nearest("park", 40),
    ...nearest("garden", 20),
    ...nearest("square", 15),
    ...nearest("picnic_site", 15),
    ...nearest("riverside", 20),
    ...nearest("hike", 20),
  ];
}
async function photonParks(p: Preferences, radiusKm: number): Promise<Destination[]> {
  const base = process.env.PHOTON_BASE_URL ??
    (process.env.NODE_ENV === "production" ? "" : "https://photon.komoot.io");
  if (!base || p.latitude === undefined || p.longitude === undefined) return [];
  try {
    const url = new URL("/reverse", base);
    url.search = new URLSearchParams({
      lat: p.latitude.toFixed(2),
      lon: p.longitude.toFixed(2),
      osm_tag: "leisure:park",
      radius: String(Math.max(1, Math.ceil(radiusKm))),
      limit: "40",
    }).toString();
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return [];
    const data = photonSchema.parse(await response.json());
    return data.features.flatMap((feature) => {
      const { name, osm_id, osm_type, osm_key, osm_value } = feature.properties;
      if (!name || osm_key !== "leisure" || osm_value !== "park") return [];
      const [longitude, latitude] = feature.geometry.coordinates;
      const distanceKm = Number(directKm(p.latitude!, p.longitude!, latitude, longitude).toFixed(2));
      if (distanceKm > radiusKm) return [];
      const type = { N: "node", W: "way", R: "relation" }[osm_type];
      return [{
        id: `osm:${type}:${osm_id}`,
        name: name.slice(0, 80),
        url: `https://www.openstreetmap.org/${type}/${osm_id}`,
        source: "OpenStreetMap",
        fetchedAt: new Date().toISOString(),
        kind: "park" as const,
        latitude,
        longitude,
        distanceKm,
      }];
    });
  } catch {
    return [];
  }
}
export async function nearbyPlaces(p: Preferences): Promise<Destination[]> {
  if (p.latitude === undefined || p.longitude === undefined) return [];
  const base =
    process.env.OVERPASS_BASE_URL ??
    (process.env.NODE_ENV === "production"
      ? ""
      : "https://overpass-api.de/api/interpreter");
  if (!base && !process.env.PHOTON_BASE_URL) return [];
  const lat = Number(p.latitude.toFixed(2)),
    lon = Number(p.longitude.toFixed(2));
  const speed = { walk: 4, bicycle: 12, car: 25, public: 10 }[p.transport];
  const parkRadius = Math.max(
    1000,
    Math.min(
      3000,
      Math.ceil((((speed * p.travelMinutes * 1000) / 60) * 1.5) / 500) * 500,
    ),
  );
  const lookForHikes =
    p.longerOuting &&
    p.interests.includes("hiking") &&
    p.intensity !== "gentle";
  const hikeRadius = Math.min(
    process.env.OVERPASS_BASE_URL ? 120000 : 60000,
    Math.max(25000, p.hikeDriveMinutes * 1000),
  );
  if (lookForHikes && base) {
    const [local, hikes] = await Promise.all([
      nearbyPlaces({ ...p, longerOuting: false }),
      nearbyHikes(p, base, lat, lon, hikeRadius),
    ]);
    return [...local, ...hikes];
  }
  const key = `outdoors-v2:${base}:${lat}:${lon}:${parkRadius}:0`;
  const legacyKey = `${base}:${lat}:${lon}:${parkRadius}:0`;
  const found = cache.get(key);
  if (found && found.until > Date.now()) return structuredClone(found.places);
  if (pending.has(key)) return structuredClone(await pending.get(key)!);
  const stored = await readStored(key);
  if (stored?.places?.length && stored.until.getTime() > Date.now()) {
    cache.set(key, { until: stored.until.getTime(), places: stored.places });
    return structuredClone(uniquePlaces(stored.places));
  }
  const legacy = await readStored(legacyKey);
  const stale = found?.places?.length
    ? found.places
    : stored?.places?.length
      ? stored.places
      : legacy?.places ?? [];
  const publicInstance = !process.env.OVERPASS_BASE_URL;
  if (publicInstance && Date.now() < nextPublicRequestAt)
    return structuredClone(uniquePlaces(stale));
  if (publicInstance) nextPublicRequestAt = Date.now() + 60000;
  const query = `[out:json][timeout:18];(nwr(around:${parkRadius},${lat},${lon})["leisure"~"^(park|nature_reserve|garden)$"]["name"];nwr(around:${parkRadius},${lat},${lon})["place"="square"]["name"];nwr(around:${parkRadius},${lat},${lon})["tourism"="picnic_site"]["name"];way(around:${parkRadius},${lat},${lon})["waterway"="river"]["name"];);out center 500;`;
  const request = (async () => {
    try {
      if (!base) return uniquePlaces((await photonParks(p, parkRadius / 1000)).concat(stale));
      const url = new URL(base);
      url.searchParams.set("data", query);
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Outwards-Days/0.1 (nearby outdoor planner; contact via project repository)",
        },
        signal: AbortSignal.timeout(22000),
      });
      if (!response.ok) return uniquePlaces((await photonParks(p, parkRadius / 1000)).concat(stale));
      const data = responseSchema.parse(await response.json());
      const places = fromOsm(data.elements, p, new Date().toISOString());
      if (!places.some((place) => place.kind === "park"))
        places.push(...await photonParks(p, parkRadius / 1000));
      if (cache.size > 100) cache.delete(cache.keys().next().value!);
      const unique = uniquePlaces(places);
      cache.set(key, { until: Date.now() + 6 * 3600000, places: unique });
      if (unique.length) await writeStored(key, unique);
      return unique;
    } catch {
      return uniquePlaces((await photonParks(p, parkRadius / 1000)).concat(stale));
    }
  })();
  pending.set(key, request);
  try {
    return structuredClone(await request);
  } finally {
    pending.delete(key);
  }
}

async function nearbyHikes(
  p: Preferences,
  base: string,
  lat: number,
  lon: number,
  radius: number,
): Promise<Destination[]> {
  const key = `hike:${base}:${lat}:${lon}:${radius}`;
  const found = cache.get(key);
  if (found && found.until > Date.now()) return structuredClone(found.places);
  if (pending.has(key)) return structuredClone(await pending.get(key)!);
  const stored = await readStored(key);
  if (stored?.places?.length && stored.until.getTime() > Date.now()) {
    cache.set(key, { until: stored.until.getTime(), places: stored.places });
    return structuredClone(stored.places);
  }
  const stale = found?.places?.length ? found.places : (stored?.places ?? []);
  const publicInstance = !process.env.OVERPASS_BASE_URL;
  if (publicInstance && Date.now() < nextPublicHikeRequestAt)
    return structuredClone(stale);
  if (publicInstance) nextPublicHikeRequestAt = Date.now() + 60000;
  const query = `[out:json][timeout:18];relation(around:${radius},${lat},${lon})["route"="hiking"]["name"]["distance"];out center 100;`;
  const request = (async () => {
    try {
      const url = new URL(base);
      url.searchParams.set("data", query);
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Outwards-Days/0.1 (nearby outdoor planner; contact via project repository)",
        },
        signal: AbortSignal.timeout(22000),
      });
      if (!response.ok) return stale;
      const data = responseSchema.parse(await response.json());
      const hikes = fromOsm(data.elements, p, new Date().toISOString()).filter(
        (place) => place.kind === "hike",
      );
      cache.set(key, { until: Date.now() + 6 * 3600000, places: hikes });
      if (hikes.length) await writeStored(key, hikes);
      return hikes;
    } catch {
      return stale;
    }
  })();
  pending.set(key, request);
  try {
    return structuredClone(await request);
  } finally {
    pending.delete(key);
  }
}
