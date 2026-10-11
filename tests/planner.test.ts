import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import {
  defaultPreferences,
  type Schedule,
  type Weather,
} from "../packages/contracts/src/index.js";
import {
  basicPlan,
  local,
  revalidateActivity,
  slots,
  validateProposals,
  weekKey,
} from "../packages/planner/src/index.js";
export const now = "2030-01-06T00:00:00Z";
export const preferences = () => ({
  ...defaultPreferences(),
  timezone: "Australia/Melbourne",
  version: 1,
});
export const schedule = (): Schedule => ({
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
export const weather: Weather = { status: "unavailable", source: "test" };
describe("calendar constraints", () => {
  it("never inserts an activity into 9–5 work, and does not invent lunch", () => {
    const s = schedule();
    s.blocks = [
      {
        id: "work",
        day: 0,
        start: "09:00",
        end: "17:00",
        nextDay: false,
        kind: "work",
      },
    ];
    const free = slots(s, preferences(), [], now);
    expect(free.filter((x) => x.localDate === "2030-01-07")).toHaveLength(1);
    expect(local("2030-01-07", "17:30", s.timezone).toUTC().toISO()).toBe(
      free[0].start,
    );
  });
  it("splits explicit lunch but a meeting still blocks lunch", () => {
    const s = schedule();
    s.blocks = [
      {
        id: "work",
        day: 0,
        start: "09:00",
        end: "17:00",
        nextDay: false,
        kind: "work",
        lunch: { start: "12:00", end: "13:00" },
      },
      {
        id: "meeting",
        day: 0,
        start: "12:15",
        end: "12:45",
        nextDay: false,
        kind: "other",
      },
    ];
    const free = slots(s, preferences(), [], now).filter(
      (x) => x.localDate === "2030-01-07",
    );
    expect(free.map((x) => x.budget)).toEqual([15, 15, 90]);
  });
  it("blocks both dates of an overnight commitment, including the preceding week", () => {
    const s = schedule();
    s.blocks = [
      {
        id: "night",
        day: -1,
        start: "22:00",
        end: "10:00",
        nextDay: true,
        kind: "sleep",
      },
      {
        id: "night2",
        day: 0,
        start: "18:00",
        end: "10:00",
        nextDay: true,
        kind: "work",
      },
    ];
    const free = slots(s, preferences(), [], now);
    expect(free[0].budget).toBe(360);
    expect(free[1].budget).toBe(60);
  });
  it("treats an unmarked weekday as an evening opportunity, but honors a day off or a narrow daytime window", () => {
    const s = schedule();
    s.windows[0] = { day: 0, start: "07:00", end: "20:00" };
    let monday = slots(s, preferences(), [], now).find((x) => x.localDate === "2030-01-07")!;
    expect(DateTime.fromISO(monday.start).setZone(s.timezone).toFormat("HH:mm")).toBe("18:00");
    s.fullDays = [0];
    monday = slots(s, preferences(), [], now).find((x) => x.localDate === "2030-01-07")!;
    expect(DateTime.fromISO(monday.start).setZone(s.timezone).toFormat("HH:mm")).toBe("09:00");
    s.fullDays = [];
    s.windows[0] = { day: 0, start: "12:00", end: "13:00" };
    monday = slots(s, preferences(), [], now).find((x) => x.localDate === "2030-01-07")!;
    expect(DateTime.fromISO(monday.start).setZone(s.timezone).toFormat("HH:mm")).toBe("12:00");
  });
  it("protects the pre-work morning even when the default window begins at 7", () => {
    const s = schedule();
    s.windows[0].start = "07:00";
    s.blocks = [
      { id: "sleep", day: -1, start: "22:00", end: "07:00", nextDay: true, kind: "sleep" },
      { id: "work", day: 0, start: "09:00", end: "17:00", nextDay: false, kind: "work" },
    ];
    const free = slots(s, preferences(), [], now).filter((x) => x.localDate === "2030-01-07");
    expect(free.map((x) => DateTime.fromISO(x.start).setZone(s.timezone).toFormat("HH:mm"))).toEqual(["17:30"]);
    const planned = basicPlan(free, preferences(), s, weather, [], now);
    expect(DateTime.fromISO(planned[0].start).setZone(s.timezone).toFormat("HH:mm")).toBe("17:30");
  });
  it("allows opted-in morning outings after waking and before work preparation", () => {
    const s = schedule();
    s.windows[0].start = "07:00";
    s.blocks = [
      { id: "sleep", day: -1, start: "22:00", end: "07:00", nextDay: true, kind: "sleep" },
      { id: "work", day: 0, start: "10:00", end: "17:00", nextDay: false, kind: "work" },
    ];
    const free = slots(s, { ...preferences(), earlyMornings: true }, [], now)
      .filter((x) => x.localDate === "2030-01-07");
    expect(free.map((x) => DateTime.fromISO(x.start).setZone(s.timezone).toFormat("HH:mm"))).toEqual(["08:00", "17:30"]);
    expect(free[0].budget).toBe(60);
  });
  it("starts short free-day plans at 9, while reserving an 8 start for a longer outing", () => {
    const s = schedule();
    s.windows = [{ day: 5, start: "07:00", end: "20:00" }];
    s.blocks = [{ id: "sleep", day: 4, start: "22:00", end: "07:00", nextDay: true, kind: "sleep" }];
    const p = { ...preferences(), longerOuting: true };
    const free = slots(s, p, [], now);
    expect(free.map((x) => [DateTime.fromISO(x.start).setZone(s.timezone).toFormat("HH:mm"), x.longOnly ?? false]))
      .toEqual([["08:00", true], ["09:00", false]]);
    const short = basicPlan(free, { ...p, longerOuting: false }, s, weather, [], now);
    expect(short[0].start).toBe(local("2030-01-12", "09:00", s.timezone).toUTC().toISO());
    const sunny: Weather = {
      status: "available", source: "test", days: {
        "2030-01-12": {
          sunrise: local("2030-01-12", "06:00", s.timezone).toUTC().toISO()!,
          sunset: local("2030-01-12", "20:30", s.timezone).toUTC().toISO()!,
          rain: 0, wind: 5, min: 12, max: 24,
        },
      },
    };
    const long = basicPlan(free, p, s, sunny, [], now);
    expect(long[0].long).toBe(true);
    expect(long[0].start).toBe(local("2030-01-12", "08:00", s.timezone).toUTC().toISO());
  });
  it("rejects missing and ambiguous DST wall times", () => {
    expect(() => local("2026-10-04", "02:30", "Australia/Melbourne")).toThrow(
      /daylight saving/,
    );
    expect(() => local("2026-04-05", "02:30", "Australia/Melbourne")).toThrow(
      /daylight saving/,
    );
  });
  it("uses local week starts and plans only future windows", () => {
    expect(weekKey("2030-01-06T14:00:00Z", preferences())).toBe("2030-01-07");
    const free = slots(schedule(), preferences(), [], "2030-01-09T08:00:00Z");
    expect(free.every((s) => s.localDate > "2030-01-09")).toBe(true);
  });
  it("allows a free weekday and leaves a busy weekend empty", () => {
    const s = schedule();
    s.blocks = [
      {
        id: "sat",
        day: 5,
        start: "08:00",
        end: "20:00",
        nextDay: false,
        kind: "other",
      },
    ];
    const free = slots(s, preferences(), [], now);
    expect(free.some((x) => x.localDate === "2030-01-09")).toBe(true);
    expect(free.some((x) => x.localDate === "2030-01-12")).toBe(false);
  });
});
describe("model semantic validation", () => {
  const make = () => {
    const p = preferences(),
      s = schedule(),
      free = slots(s, p, [], now);
    const a = basicPlan(free, p, s, weather, [], now)[0];
    const {
      slotId,
      templateId,
      category,
      title,
      activityMinutes,
      intensity,
      destinationId,
      reason,
      steps,
    } = a;
    return {
      p,
      s,
      free,
      proposal: {
        slotId,
        templateId,
        category,
        title,
        activityMinutes,
        intensity,
        destinationId,
        reason,
        steps,
      },
    };
  };
  it.each([
    { slotId: "unknown" },
    { destinationId: "invented" },
    { activityMinutes: 180 },
    { category: "hiking" },
    { intensity: "vigorous" },
    { templateId: "existing-plants" },
  ])("rejects adversarial proposal %j", (patch) => {
    const { p, s, free, proposal } = make();
    expect(() =>
      validateProposals(
        { activities: [{ ...proposal, ...patch }] },
        free,
        p,
        s,
        weather,
        [],
        now,
      ),
    ).toThrow();
  });
  it("counts preparation, both travel legs and buffer", () => {
    const { p, s, free, proposal } = make();
    expect(() =>
      validateProposals(
        { activities: [proposal] },
        [
          {
            ...free[0],
            budget: 30,
            end: new Date(Date.parse(free[0].start) + 30 * 60000).toISOString(),
          },
        ],
        p,
        s,
        weather,
        [],
        now,
      ),
    ).toThrow(/budget/);
  });
  it("reserves accepted activities and counts them toward frequency limits", () => {
    const p = { ...preferences(), daysPerWeek: 1 },
      s = schedule();
    const a = basicPlan(slots(s, p, [], now), p, s, weather, [], now)[0];
    a.state = "accepted";
    expect(
      basicPlan(slots(s, p, [a], now), p, s, weather, [a], now),
    ).toHaveLength(0);
    expect(() => revalidateActivity(a, s, p, [a], now)).not.toThrow();
  });
  it("can revalidate a scheduled outing after its start without inventing a calendar conflict", () => {
    const s = schedule();
    s.fullDays = [0];
    const p = preferences();
    const activity = basicPlan(slots(s, p, [], now), p, s, weather, [], now)[0];
    const later = new Date(Date.parse(activity.end) + 60_000).toISOString();
    expect(() => revalidateActivity(activity, s, p, [activity], later)).not.toThrow();
    s.blocks.push({ id: "real-conflict", day: 0, start: "09:00", end: "12:00", nextDay: false, kind: "other" });
    expect(() => revalidateActivity(activity, s, p, [activity], later)).toThrow("This time now conflicts");
  });
  it("keeps an already accepted early plan valid when the time preference changes", () => {
    const s = schedule();
    s.windows[0].start = "07:00";
    const p = { ...preferences(), earlyMornings: true };
    const activity = basicPlan(slots(s, p, [], now), p, s, weather, [], now)[0];
    activity.state = "accepted";
    expect(() => revalidateActivity(activity, s, { ...p, earlyMornings: false }, [activity], now)).not.toThrow();
  });
  it("does not schedule daylight-dependent outings without daylight data", () => {
    const p = {
      ...preferences(),
      longerOuting: true,
      interests: ["photography"] as const,
    };
    expect(
      basicPlan(
        slots(schedule(), { ...p, interests: [...p.interests] }, [], now),
        { ...p, interests: [...p.interests] },
        schedule(),
        weather,
        [],
        now,
      ),
    ).toHaveLength(0);
  });
  it("fits one longer outing entirely within sourced daylight", () => {
    const p = { ...preferences(), longerOuting: true },
      s = schedule();
    const w: Weather = {
      status: "available",
      source: "test",
      fetchedAt: now,
      days: Object.fromEntries(
        slots(s, p, [], now).map((x) => [
          x.localDate,
          {
            sunrise: local(x.localDate, "10:00", s.timezone).toUTC().toISO()!,
            sunset: local(x.localDate, "16:00", s.timezone).toUTC().toISO()!,
            rain: 0,
            wind: 5,
            min: 15,
            max: 23,
          },
        ]),
      ),
    };
    const result = basicPlan(slots(s, p, [], now), p, s, w, [], now);
    expect(result.filter((a) => a.long)).toHaveLength(1);
    const outing = result.find((a) => a.long)!;
    expect(outing.start).toBe(w.days![outing.localDate].sunrise);
  });
  it("preserves a no-time outcome", () => {
    const s = schedule();
    s.windows = [];
    expect(
      basicPlan(
        slots(s, preferences(), [], now),
        preferences(),
        s,
        weather,
        [],
        now,
      ),
    ).toEqual([]);
  });
});
