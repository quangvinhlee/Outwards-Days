import { expect, it, vi } from "vitest";
import { fromOsm, routeKm } from "../apps/api/src/places.js";
import { withDriveTimes } from "../apps/api/src/routing.js";
import {
  defaultPreferences,
  type Destination,
  type Schedule,
  type Weather,
} from "../packages/contracts/src/index.js";
import {
  basicPlan,
  catalogue,
  placeFits,
  slots,
  validateProposals,
} from "../packages/planner/src/index.js";
const now = "2030-01-06T00:00:00Z";
const schedule = (): Schedule => ({
  weekStart: "2030-01-07",
  timezone: "Australia/Melbourne",
  blocks: [],
  windows: Array.from({ length: 7 }, (_, day) => ({
    day,
    start: "09:00",
    end: "19:00",
  })),
  confirmedDays: [0, 1, 2, 3, 4, 5, 6],
  version: 1,
  confirmedAt: now,
});

it("requires a measured drive below the hiking limit", () => {
  const p = {
    ...defaultPreferences(),
    interests: ["hiking" as const],
    intensity: "moderate" as const,
    longerOuting: true,
    hikeDriveMinutes: 120,
  };
  const trail: Destination = {
    id: "route-1",
    name: "Loop Trail",
    url: "https://www.openstreetmap.org/relation/1",
    source: "OpenStreetMap",
    fetchedAt: now,
    kind: "hike",
    routeKm: 5,
    distanceKm: 70,
  };
  const template = catalogue.find((t) => t.id === "hiking-loop")!;
  expect(placeFits(trail, template, p)).toBe(false);
  expect(placeFits({ ...trail, driveMinutes: 120 }, template, p)).toBe(false);
  expect(placeFits({ ...trail, driveMinutes: 119 }, template, p)).toBe(true);
});

it("uses a routed duration and rejects a remote road snap", async () => {
  const mock = vi.fn(async (_url: string) =>
    new Response(
      JSON.stringify({
        code: "Ok",
        routes: [{ duration: 3500 }],
        waypoints: [{ distance: 25 }, { distance: 100 }],
      }),
      { status: 200 },
    ),
  );
  vi.stubGlobal("fetch", mock);
  try {
    const p = { ...defaultPreferences(), latitude: -37.9, longitude: 145.1 };
    const hike: Destination = {
      id: "routed-loop",
      name: "Routed Loop",
      url: "https://www.openstreetmap.org/relation/2",
      source: "OpenStreetMap",
      fetchedAt: now,
      kind: "hike",
      routeKm: 5,
      distanceKm: 20,
      latitude: -37.95,
      longitude: 145.2,
    };
    const [result] = await withDriveTimes(p, [hike]);
    expect(result.driveMinutes).toBe(59);
    expect(mock).toHaveBeenCalledOnce();
    expect(String(mock.mock.calls[0][0])).toContain("/route/v1/driving/");
  } finally {
    vi.unstubAllGlobals();
  }
});

it("maps nearby parks and only loop hikes with a source distance", () => {
  const p = { ...defaultPreferences(), latitude: -37.81, longitude: 144.96 };
  const elements: Parameters<typeof fromOsm>[0] = [
    {
      type: "way" as const,
      id: 10,
      center: { lat: -37.811, lon: 144.961 },
      tags: { name: "Garden Square", leisure: "park" },
    },
    {
      type: "relation" as const,
      id: 20,
      center: { lat: -37.82, lon: 144.96 },
      tags: {
        name: "Creek Circuit",
        route: "hiking",
        roundtrip: "yes",
        distance: "4.5 km",
      },
    },
    {
      type: "relation" as const,
      id: 21,
      center: { lat: -37.82, lon: 144.96 },
      tags: { name: "Unverified Trail", route: "hiking", distance: "4 km" },
    },
    {
      type: "way" as const,
      id: 22,
      center: { lat: -37.811, lon: 144.961 },
      tags: { name: "Private Park", leisure: "park", access: "private" },
    },
    { type: "way" as const, id: 23, center: { lat: -37.812, lon: 144.962 }, tags: { name: "Community Garden", leisure: "garden" } },
    { type: "way" as const, id: 24, center: { lat: -37.813, lon: 144.963 }, tags: { name: "Civic Square", place: "square" } },
    { type: "node" as const, id: 25, lat: -37.814, lon: 144.964, tags: { name: "Picnic Tables", tourism: "picnic_site" } },
  ];
  const places = fromOsm(elements, p, now);
  expect(places.map((x) => x.name)).toEqual(["Garden Square", "Community Garden", "Civic Square", "Picnic Tables", "Creek Circuit"]);
  expect(places[4]).toMatchObject({
    kind: "hike",
    routeKm: 4.5,
    url: "https://www.openstreetmap.org/relation/20",
  });
  expect(routeKm("2 mi")).toBe(3.2);
  expect(routeKm("not surveyed")).toBeUndefined();
});

it("rotates a nearby park after a previous visit and rejects an invented place", () => {
  const p = {
    ...defaultPreferences(),
    interests: ["park" as const],
    daysPerWeek: 1,
    travelMinutes: 20,
  };
  const s = schedule();
  s.windows = [{ day: 0, start: "09:00", end: "12:00" }];
  const places: Destination[] = [
    {
      id: "park-a",
      name: "Garden Square",
      url: "https://example.test/a",
      source: "test",
      fetchedAt: now,
      kind: "park",
      distanceKm: 0.2,
    },
    {
      id: "park-b",
      name: "River Park",
      url: "https://example.test/b",
      source: "test",
      fetchedAt: now,
      kind: "park",
      distanceKm: 0.3,
    },
  ];
  const free = slots(s, p, [], now);
  const previous = basicPlan(
    free,
    p,
    s,
    { status: "unavailable", source: "test" },
    [],
    now,
    undefined,
    { places: [places[0]] },
  )[0];
  previous.state = "completed";
  const plan = basicPlan(
    free,
    p,
    s,
    { status: "unavailable", source: "test" },
    [],
    now,
    undefined,
    { places, history: [previous] },
  );
  expect(plan[0].destinationId).toBe("park-b");
  expect(() =>
    validateProposals(
      { activities: [{ ...plan[0], destinationId: "made-up" }] },
      free,
      p,
      s,
      { status: "unavailable", source: "test" },
      [],
      now,
      places,
    ),
  ).toThrow();
});

it("uses each reachable park before repeating one with its location", () => {
  const p = {
    ...defaultPreferences(),
    interests: ["park" as const],
    daysPerWeek: 3,
    travelMinutes: 20,
  };
  const s = schedule();
  s.windows = [0, 1, 2].map((day) => ({
    day,
    start: "09:00",
    end: "12:00",
  }));
  const places: Destination[] = ["Garden Square", "River Park"].map(
    (name, i) => ({
      id: `park-${i}`,
      name,
      url: `https://example.test/${i}`,
      source: "test",
      fetchedAt: now,
      kind: "park",
      distanceKm: 0.2 + i * 0.1,
    }),
  );
  const plan = basicPlan(
    slots(s, p, [], now),
    p,
    s,
    { status: "unavailable", source: "test" },
    [],
    now,
    undefined,
    { places },
  );
  expect(plan).toHaveLength(3);
  expect(new Set(plan.slice(0, 2).map((a) => a.destinationId)).size).toBe(2);
  expect(plan[2].destinationId).not.toBeNull();
  expect(plan.every((activity) => activity.title.includes(activity.destination!.name))).toBe(true);
});

it("reserves a free weekend for a sourced hiking loop and its full time budget", () => {
  const p = {
    ...defaultPreferences(),
    interests: ["walk" as const, "hiking" as const],
    intensity: "moderate" as const,
    longerOuting: true,
    longMinutes: 180,
    travelMinutes: 20,
    daysPerWeek: 4,
  };
  const s = schedule();
  s.blocks = Array.from({ length: 5 }, (_, day) => ({
    id: `work-${day}`,
    day,
    start: "09:00",
    end: "17:00",
    nextDay: false,
    kind: "work" as const,
  }));
  const days = Object.fromEntries(
    Array.from({ length: 7 }, (_, day) => {
      const date = new Date(Date.parse("2030-01-07T00:00:00Z") + day * 86400000)
        .toISOString()
        .slice(0, 10);
      return [
        date,
        {
          sunrise: new Date(
            Date.parse(`${date}T00:00:00Z`) - 13 * 3600000,
          ).toISOString(),
          sunset: new Date(
            Date.parse(`${date}T00:00:00Z`) + 8 * 3600000,
          ).toISOString(),
          rain: 0,
          wind: 5,
          min: 15,
          max: 25,
        },
      ];
    }),
  );
  const w: Weather = { status: "available", source: "test", days };
  const trail: Destination = {
    id: "loop-1",
    name: "Creek Circuit",
    url: "https://www.openstreetmap.org/relation/20",
    source: "OpenStreetMap",
    fetchedAt: now,
    kind: "hike",
    routeKm: 4,
    distanceKm: 0.5,
    driveMinutes: 20,
  };
  const plan = basicPlan(slots(s, p, [], now), p, s, w, [], now, undefined, {
    places: [trail],
  });
  const hike = plan.find((a) => a.category === "hiking");
  expect(hike).toBeDefined();
  expect(hike!.localDate).toBe("2030-01-12");
  expect(hike!.destinationId).toBe("loop-1");
  expect(hike!.totalMinutes).toBe(hike!.activityMinutes + 60);
  expect(plan.filter((a) => a.long)).toHaveLength(1);
});
