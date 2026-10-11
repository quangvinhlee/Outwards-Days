import { afterEach, it, expect, vi } from "vitest";
import { generate } from "../apps/api/src/workflow.js";
import {
  defaultPreferences,
  type Activity,
  type Schedule,
} from "../packages/contracts/src/index.js";
const input = {
  preferences: defaultPreferences(),
  schedule: {
    weekStart: "2030-01-07",
    timezone: "Australia/Melbourne",
    version: 1,
    confirmedDays: [0, 1, 2, 3, 4, 5, 6],
    blocks: [],
    windows: [{ day: 0, start: "12:00", end: "12:30" }],
  } as Schedule,
  existing: [],
  now: "2030-01-06T00:00:00Z",
};
afterEach(() => vi.unstubAllGlobals());
it("repairs malformed model JSON once and labels deterministic fallback", async () => {
  const request = vi.fn(
    async () =>
      new Response(JSON.stringify({ message: { content: "not JSON" } })),
  );
  vi.stubGlobal("fetch", request);
  const plan = await generate(input);
  expect(request).toHaveBeenCalledTimes(2);
  expect(plan.source).toBe("basic");
  expect(plan.attempts).toBe(2);
  expect(plan.activities[0].totalMinutes).toBeLessThanOrEqual(30);
});
it("rejects model choices outside the server's feasible list", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) => {
      const body = JSON.parse(options.body);
      const context = JSON.parse(body.messages[1].content);
      return new Response(
        JSON.stringify({
          message: {
            content: JSON.stringify({
              activities: {
                day0: {
                  choice: context.feasibleChoices.day0.length,
                },
              },
            }),
          },
        }),
      );
    }),
  );
  const plan = await generate(input);
  expect(plan.source).toBe("basic");
  expect(plan.activities.every((a) => a.destinationId === null)).toBe(true);
});
it("accepts independently validated live output and minimizes model context", async () => {
  const request = vi.fn(async (_url, options) => {
    const body = JSON.parse(options.body);
    const context = JSON.parse(body.messages[1].content);
    expect(context.blocks).toBeUndefined();
    expect(context.preferences.area).toBeUndefined();
    expect(context.reflectionOptions).toContain("How do you feel today?");
    expect(context.recentActivities[0]).toMatchObject({ category: "walk", observations: ["The path felt peaceful"] });
    return new Response(
      JSON.stringify({
        message: {
          content: JSON.stringify({
            activities: {
              day0: {
                choice: 0,
                reflectionChoice: 1,
              },
            },
          }),
        },
      }),
    );
  });
  vi.stubGlobal("fetch", request);
  const plan = await generate({ ...input, history: [{ category: "walk", state: "completed", start: "2029-12-29T02:00:00Z", missionNotes: { "describe-scene": "The path felt peaceful" }, completedMissionIds: ["describe-scene"] } as unknown as Activity] });
  expect(plan.source).toBe("gemma");
  expect(plan.activities[0].totalMinutes).toBe(30);
  expect(plan.activities[0].missions?.some((mission) => mission.id === "feeling-today")).toBe(true);
  expect(request).toHaveBeenCalledTimes(1);
});
it("does not call providers or force an activity when no slots remain", async () => {
  const request = vi.fn();
  vi.stubGlobal("fetch", request);
  const plan = await generate({
    ...input,
    schedule: { ...input.schedule, windows: [] },
  });
  expect(request).not.toHaveBeenCalled();
  expect(plan.activities).toEqual([]);
});
it("uses a mapped nearby park in a time-bounded suggestion", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, options) => {
      const target = String(url);
      if (target.includes("overpass"))
        return new Response(
          JSON.stringify({
            elements: [
              {
                type: "node",
                id: 42,
                lat: -37.8105,
                lon: 144.9605,
                tags: { leisure: "park", name: "Garden Square" },
              },
            ],
          }),
        );
      if (target.includes("open-meteo"))
        return new Response("", { status: 503 });
      const body = JSON.parse(options.body);
      const context = JSON.parse(body.messages[1].content);
      const choice = context.feasibleChoices.day0.findIndex(
        (x: { destinationId: string | null }) => x.destinationId,
      );
      return new Response(
        JSON.stringify({
          message: {
            content: JSON.stringify({ activities: { day0: { choice } } }),
          },
        }),
      );
    }),
  );
  const plan = await generate({
    ...input,
    preferences: { ...input.preferences, latitude: -37.81, longitude: 144.96 },
  });
  expect(plan.source).toBe("gemma");
  expect(plan.activities[0].destination).toMatchObject({
    name: "Garden Square",
    kind: "park",
  });
  expect(plan.activities[0].totalMinutes).toBeLessThanOrEqual(30);
});
