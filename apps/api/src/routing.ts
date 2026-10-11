import { z } from "zod";
import type {
  Destination,
  Preferences,
} from "../../../packages/contracts/src/index.js";

const routeResponse = z.object({
  code: z.string(),
  routes: z.array(z.object({ duration: z.number().nonnegative() })).optional(),
  waypoints: z.array(z.object({ distance: z.number().nonnegative() })).optional(),
});
const cache = new Map<string, { until: number; minutes?: number }>();
let nextDemoRequestAt = 0;

export async function withDriveTimes(
  p: Preferences,
  places: Destination[],
): Promise<Destination[]> {
  if (p.latitude === undefined || p.longitude === undefined) return places;
  const base =
    process.env.ROUTING_BASE_URL ??
    (process.env.NODE_ENV === "production"
      ? ""
      : "https://router.project-osrm.org");
  if (!base) return places;
  const hikes = places
    .filter(
      (d) =>
        d.kind === "hike" &&
        d.latitude !== undefined &&
        d.longitude !== undefined &&
        (d.distanceKm ?? Infinity) <= 150,
    )
    .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
    .slice(0, 6);
  const estimates = new Map<string, number>();
  for (const hike of hikes) {
    const key = `${base}:${p.longitude.toFixed(2)},${p.latitude.toFixed(2)}:${hike.longitude!.toFixed(4)},${hike.latitude!.toFixed(4)}`;
    let hit = cache.get(key);
    if (!hit || hit.until <= Date.now()) {
      if (!process.env.ROUTING_BASE_URL) {
        const wait = nextDemoRequestAt - Date.now();
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
        nextDemoRequestAt = Date.now() + 1100;
      }
      try {
        const url = `${base.replace(/\/$/, "")}/route/v1/driving/${p.longitude.toFixed(2)},${p.latitude.toFixed(2)};${hike.longitude!.toFixed(4)},${hike.latitude!.toFixed(4)}?overview=false&steps=false`;
        const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error("Routing unavailable");
        const result = routeResponse.parse(await response.json());
        const route = result.routes?.[0];
        hit = {
          until: Date.now() + 24 * 3600000,
          ...(result.code === "Ok" &&
          route &&
          result.waypoints?.every((w) => w.distance <= 2000)
            ? { minutes: Math.max(1, Math.ceil(route.duration / 60)) }
            : {}),
        };
      } catch {
        hit = { until: Date.now() + 5 * 60000 };
      }
      if (cache.size > 500) cache.delete(cache.keys().next().value!);
      cache.set(key, hit);
    }
    if (hit.minutes !== undefined) estimates.set(hike.id, hit.minutes);
  }
  return places.map((d) =>
    estimates.has(d.id) ? { ...d, driveMinutes: estimates.get(d.id) } : d,
  );
}
