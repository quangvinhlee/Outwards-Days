import { z } from "zod";
import { directKm, nearbyPlaces } from "./places.js";
import { withDriveTimes } from "./routing.js";
import type {
  Destination,
  Preferences,
  Weather,
} from "../../../packages/contracts/src/index.js";
const cache = new Map<string, { expires: number; value: unknown }>();
async function cached<T>(
  key: string,
  ttl: number,
  fn: () => Promise<T>,
): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return structuredClone(hit.value) as T;
  const value = await fn();
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
  cache.set(key, { expires: Date.now() + ttl, value });
  return value;
}
export async function forecast(p: Preferences): Promise<Weather> {
  const source = "https://open-meteo.com/";
  if (p.latitude === undefined || p.longitude === undefined)
    return { status: "unavailable", source };
  try {
    return await cached(
      `weather:${p.latitude.toFixed(2)}:${p.longitude.toFixed(2)}:${p.timezone}`,
      30 * 60000,
      async () => {
        const url = new URL(
          "/v1/forecast",
          process.env.WEATHER_BASE_URL || "https://api.open-meteo.com",
        );
        url.search = new URLSearchParams({
          latitude: p.latitude!.toFixed(2),
          longitude: p.longitude!.toFixed(2),
          timezone: p.timezone,
          forecast_days: "14",
          daily:
            "sunrise,sunset,precipitation_probability_max,wind_speed_10m_max,temperature_2m_min,temperature_2m_max",
        }).toString();
        let response: Response | undefined;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            response = await fetch(url, { signal: AbortSignal.timeout(8000) });
            if (response.ok) break;
          } catch {
            /* One retry covers transient forecast service/network failures. */
          }
          if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 500));
        }
        if (!response?.ok) throw new Error("forecast");
        const data = z
          .object({
            daily: z.object({
              time: z.array(z.string()),
              sunrise: z.array(z.string()),
              sunset: z.array(z.string()),
              precipitation_probability_max: z.array(z.number().nullable()),
              wind_speed_10m_max: z.array(z.number().nullable()),
              temperature_2m_min: z.array(z.number()),
              temperature_2m_max: z.array(z.number()),
            }),
          })
          .parse(await response.json()).daily;
        const { DateTime } = await import("luxon");
        const days: NonNullable<Weather["days"]> = {};
        data.time.forEach((day, i) => {
          days[day] = {
            sunrise: DateTime.fromISO(data.sunrise[i], { zone: p.timezone })
              .toUTC()
              .toISO()!,
            sunset: DateTime.fromISO(data.sunset[i], { zone: p.timezone })
              .toUTC()
              .toISO()!,
            rain: data.precipitation_probability_max[i] ?? 100,
            wind: data.wind_speed_10m_max[i] ?? 100,
            min: data.temperature_2m_min[i],
            max: data.temperature_2m_max[i],
          };
        });
        return {
          status: "available" as const,
          source,
          fetchedAt: new Date().toISOString(),
          days,
        };
      },
    );
  } catch {
    return { status: "unavailable", source };
  }
}
async function serpPlaces(p: Preferences): Promise<Destination[]> {
  if (!process.env.SERPAPI_API_KEY || !p.area) return [];
  try {
    return await cached(
      `places:${p.area.toLowerCase()}:${p.latitude ?? ""}:${p.longitude ?? ""}`,
      86400000,
      async () => {
        const url = new URL("https://serpapi.com/search.json");
        url.search = new URLSearchParams({
          engine: "google_maps",
          type: "search",
          q: `parks in ${p.area}`,
          ...(p.latitude !== undefined && p.longitude !== undefined
            ? { ll: `@${p.latitude},${p.longitude},14z` }
            : {}),
          api_key: process.env.SERPAPI_API_KEY!,
        }).toString();
        const response = await fetch(url, {
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) return [];
        const raw = z
          .object({
            local_results: z
              .array(
                z.object({
                  place_id: z.string(),
                  title: z.string(),
                  type: z.string().optional(),
                  website: z.string().optional(),
                  gps_coordinates: z
                    .object({ latitude: z.number(), longitude: z.number() })
                    .optional(),
                }),
              )
              .optional(),
          })
          .parse(await response.json());
        return (raw.local_results ?? [])
          .filter((x) =>
            /\b(park|nature reserve|botanical garden|arboretum)\b/i.test(
              x.type ?? "",
            ),
          )
          .slice(0, 5)
          .map((x) => ({
          id: x.place_id,
          name: x.title,
          url: x.website?.startsWith("https://")
            ? x.website
            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(x.title + " " + p.area)}`,
          source: "https://serpapi.com/google-maps-api",
          fetchedAt: new Date().toISOString(),
          kind: "park" as const,
          ...(x.gps_coordinates
            ? {
                latitude: x.gps_coordinates.latitude,
                longitude: x.gps_coordinates.longitude,
                ...(p.latitude !== undefined && p.longitude !== undefined
                  ? {
                      distanceKm: Number(
                        directKm(
                          p.latitude,
                          p.longitude,
                          x.gps_coordinates.latitude,
                          x.gps_coordinates.longitude,
                        ).toFixed(2),
                      ),
                    }
                  : {}),
              }
            : {}),
          }));
      },
    );
  } catch {
    return [];
  }
}

export async function destinations(p: Preferences): Promise<Destination[]> {
  const [nearby, serp] = await Promise.all([nearbyPlaces(p), serpPlaces(p)]);
  return withDriveTimes(p, [...nearby, ...serp]);
}
