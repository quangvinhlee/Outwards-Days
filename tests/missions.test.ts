import { expect, it } from "vitest";
import { missionsFor, type Activity } from "../packages/contracts/src/index.js";
import { personalizeMissions, placeScore } from "../packages/planner/src/index.js";

it("gives each park session short, stable missions with variety across a week", () => {
  const days = Array.from({ length: 7 }, (_, index) =>
    missionsFor("park", `2026-10-${String(12 + index).padStart(2, "0")}`, "Flagstaff Gardens", 25),
  );
  expect(days.every((missions) => missions.length === 3)).toBe(true);
  expect(days.every((missions) => new Set(missions.map((mission) => mission.id)).size === 3)).toBe(true);
  expect(new Set(days.map((missions) => missions[0].id)).size).toBeGreaterThan(1);
  expect(days.every((missions, index) => index === 0 || missions[0].id !== days[index - 1][0].id)).toBe(true);
  expect(missionsFor("park", "2026-10-12", "Flagstaff Gardens", 25)).toEqual(days[0]);
});

it("uses a route check on hikes and practical care steps while gardening", () => {
  const hike = missionsFor("hiking", "2026-10-17", "Lyrebird Loop", 180);
  expect(hike[0]).toMatchObject({ id: "trail-marker" });
  expect(hike[0].detail).toContain("Lyrebird Loop");
  const garden = missionsFor("garden", "2026-10-17", undefined, 10);
  expect(garden.map((mission) => mission.id)).toEqual(["soil-check", "garden-note"]);
});

it("uses prior completed missions and a garden note to change the next visit", () => {
  const first = { category: "garden", localDate: "2026-10-12", activityMinutes: 25, start: "2026-10-12T07:00:00Z", state: "completed", completedMissionIds: ["plant-seedling", "garden-note"], missionNotes: { "garden-note": "Planted basil by the back fence" } } as unknown as Activity;
  const next = { ...first, id: "next", localDate: "2026-10-19", start: "2026-10-19T07:00:00Z", state: "suggested", completedMissionIds: [], missionNotes: {} } as Activity;
  const [personalized] = personalizeMissions([next], [first]);
  expect(personalized.missions?.find((mission) => mission.id === "growth-check")).toMatchObject({ kind: "reflection" });
  expect(personalized.missions?.find((mission) => mission.id === "growth-check")?.detail).toContain("Planted basil");
  const repeated = missionsFor("park", "2026-10-19", "Flagstaff Gardens", 25);
  const changed = missionsFor("park", "2026-10-19", "Flagstaff Gardens", 25, [repeated[0].id, repeated[0].id]);
  expect(changed[0].id).not.toBe(repeated[0].id);
});

it("prefers a new place after a completed park visit", () => {
  const visited = { category: "park", templateId: "park-visit", destinationId: "park-a", state: "completed", start: "2026-10-10T09:00:00Z" } as Activity;
  const place = (id: string) => ({ id, distanceKm: 1 }) as Activity["destination"];
  expect(placeScore(place("park-a")!, "park-visit", "park", [visited], []))
    .toBeGreaterThan(placeScore(place("park-b")!, "park-visit", "park", [visited], []));
});

it("turns a park reflection into a specific follow-up on a return visit", () => {
  const first = {
    category: "park", destinationId: "park-a", destination: { id: "park-a", name: "Flagstaff Gardens" },
    localDate: "2026-10-12", activityMinutes: 25, start: "2026-10-12T07:00:00Z",
    state: "completed", completedMissionIds: ["describe-scene"],
    missionNotes: { "describe-scene": "The old fig tree had new leaves" },
  } as unknown as Activity;
  const next = { ...first, id: "next", slotId: "next-slot", localDate: "2026-10-19", start: "2026-10-19T07:00:00Z", state: "suggested", completedMissionIds: [], missionNotes: {} } as Activity;
  const [personalized] = personalizeMissions([next], [first], { "next-slot": 1 });
  const reflection = personalized.missions?.find((mission) => mission.kind === "reflection");
  expect(reflection?.id).toBe("notice-change");
  expect(reflection?.detail).toContain("old fig tree had new leaves");
  expect(reflection?.detail).toContain("Flagstaff Gardens");
});

it("can build a follow-up from overall feedback when no mini-mission note was written", () => {
  const first = { category: "hiking", start: "2026-10-12T07:00:00Z", state: "completed", feedback: "The last climb felt easier than I expected", missionNotes: {} } as unknown as Activity;
  const next = { ...first, id: "next", localDate: "2026-10-19", activityMinutes: 120, start: "2026-10-19T07:00:00Z", state: "suggested", feedback: undefined } as Activity;
  const [personalized] = personalizeMissions([next], [first]);
  expect(personalized.missions?.find((mission) => mission.kind === "reflection")?.detail).toContain("last climb felt easier");
});
