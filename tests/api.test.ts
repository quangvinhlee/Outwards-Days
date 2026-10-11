import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { PlanningInput } from "../apps/api/src/workflow.js";
import { buildApp } from "../apps/api/src/app.js";
import { MemoryStore } from "../apps/api/src/store.js";
import { basicPlan, slots } from "../packages/planner/src/index.js";
import {
  defaultPreferences,
  type Plan,
  type Schedule,
} from "../packages/contracts/src/index.js";
const initialNow = "2030-01-06T00:00:00Z";
const schedule: Schedule = {
  weekStart: "2030-01-07",
  timezone: "Australia/Melbourne",
  blocks: [],
  windows: Array.from({ length: 7 }, (_, day) => ({
    day,
    start: "09:00",
    end: "19:00",
  })),
  confirmedDays: [0, 1, 2, 3, 4, 5, 6],
  version: 0,
};
async function setup(duringGeneration?: (store: MemoryStore) => void, verifyPhoto?: (image: string, target: string) => Promise<{ match: boolean; reason: string }>) {
  let now = initialNow;
  const store = new MemoryStore();
  const generator = async (
    input: PlanningInput,
  ): Promise<Omit<Plan, "revision">> => ({
    weekStart: input.schedule.weekStart,
    scheduleVersion: input.schedule.version,
    preferenceVersion: input.preferences.version,
    source: "basic",
    notice: "test",
    activities: basicPlan(
      slots(input.schedule, input.preferences, input.existing, input.now),
      input.preferences,
      input.schedule,
      { status: "unavailable", source: "test" },
      input.existing,
      input.now,
    ),
    generatedAt: now,
    model: "fixture",
    attempts: 0,
    destinations: [],
  });
  const { app, tick } = await buildApp(store, {
    now: () => now,
    generate: async (input) => {
      const result = await generator(input);
      duringGeneration?.(store);
      return result;
    },
    verifyPhoto,
  });
  const guest = await app.inject({ method: "POST", url: "/v1/sessions/guest" });
  const headers = { authorization: `Bearer ${guest.json().token}` };
  const call = (
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    url: string,
    payload?: Record<string, unknown>,
  ) => app.inject({ method, url, headers, payload });
  await call("PATCH", "/v1/me/preferences", defaultPreferences());
  await call("PUT", `/v1/schedules/${schedule.weekStart}`, schedule);
  return {
    store,
    app,
    tick,
    call,
    token: guest.json().token as string,
    setNow: (n: string) => {
      now = n;
    },
  };
}
async function planned(verifyPhoto?: (image: string, target: string) => Promise<{ match: boolean; reason: string }>) {
  const ctx = await setup(undefined, verifyPhoto);
  const response = await ctx.call("POST", "/v1/plans/generate", {
    weekStart: schedule.weekStart,
  });
  expect(response.statusCode).toBe(202);
  await ctx.tick();
  const plan = (
    await ctx.call("GET", `/v1/plans/${schedule.weekStart}`)
  ).json<Plan>();
  return { ...ctx, plan };
}
describe("API ownership and atomic transitions", () => {
  it("accepts six-character passwords and returns readable validation errors", async () => {
    const { app, call } = await setup();
    const short = await call("POST", "/v1/auth/register", { email: "six@example.com", password: "12345" });
    expect(short.statusCode).toBe(422);
    expect(short.json().error.message).toBe("Password: Use at least 6 characters.");
    const created = await call("POST", "/v1/auth/register", { email: "six@example.com", password: "123456" });
    expect(created.statusCode).toBe(200);
    const login = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: "six@example.com", password: "123456" } });
    expect(login.statusCode).toBe(200);
    await app.close();
  });
  it("claims an existing guest profile and restores its history after signing in elsewhere", async () => {
    const { app, call, plan, token } = await planned();
    const email = "Walker@Example.com";
    const password = "a long garden password";
    const registered = await call("POST", "/v1/auth/register", { email, password });
    expect(registered.statusCode).toBe(200);
    const account = registered.json<{ token: string; userId: string; email: string }>();
    expect(account.email).toBe("walker@example.com");
    expect((await call("GET", "/v1/me")).statusCode).toBe(401);
    const loggedIn = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: "walker@example.com", password } });
    expect(loggedIn.statusCode).toBe(200);
    const otherDevice = { authorization: `Bearer ${loggedIn.json().token}` };
    const me = await app.inject({ method: "GET", url: "/v1/me", headers: otherDevice });
    expect(me.json().account.email).toBe("walker@example.com");
    const history = await app.inject({ method: "GET", url: "/v1/history", headers: otherDevice });
    expect(history.json().plans[0].activities[0].id).toBe(plan.activities[0].id);
    expect(account.token).not.toBe(token);
    const outsider = (await app.inject({ method: "POST", url: "/v1/sessions/guest" })).json();
    expect((await app.inject({ method: "GET", url: `/v1/plans/${plan.weekStart}`, headers: { authorization: `Bearer ${outsider.token}` } })).json()).toBeNull();
    expect((await app.inject({ method: "POST", url: `/v1/activities/${plan.activities[0].id}/accept`, headers: { authorization: `Bearer ${outsider.token}` }, payload: { revision: plan.revision } })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: "/v1/auth/logout", headers: otherDevice })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/v1/me", headers: otherDevice })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/v1/me", headers: { authorization: `Bearer ${account.token}` } })).statusCode).toBe(200);
    await app.close();
  });
  it("rejects duplicate accounts and wrong passwords, then frees email on deletion", async () => {
    const { app, call } = await setup();
    const credentials = { email: "me@example.com", password: "a safely long password" };
    const first = await call("POST", "/v1/auth/register", credentials);
    expect(first.statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/v1/auth/login", payload: { ...credentials, password: "wrong" } })).statusCode).toBe(401);
    const guest = (await app.inject({ method: "POST", url: "/v1/sessions/guest" })).json();
    expect((await app.inject({ method: "POST", url: "/v1/auth/register", headers: { authorization: `Bearer ${guest.token}` }, payload: credentials })).statusCode).toBe(409);
    const headers = { authorization: `Bearer ${first.json().token}` };
    expect((await app.inject({ method: "DELETE", url: "/v1/me", headers })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/v1/auth/register", headers: { authorization: `Bearer ${guest.token}` }, payload: credentials })).statusCode).toBe(200);
    await app.close();
  });
  it("accepts a still-valid outing after its scheduled start", async () => {
    const { app, call, plan, setNow } = await planned();
    const a = plan.activities[0];
    setNow(new Date(Date.parse(a.start) + 10 * 60_000).toISOString());
    const accepted = await call("POST", `/v1/activities/${a.id}/accept`, { revision: plan.revision });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json<Plan>().activities.find((item) => item.id === a.id)?.state).toBe("accepted");
    await app.close();
  });
  it("requires a written observation before completing a reflection mission and saves it for later plans", async () => {
    const { app, call, store, plan, setNow } = await planned();
    const a = plan.activities[0];
    const owner = [...store.users.values()][0];
    owner.plans[schedule.weekStart].activities[0].missions = [{ id: "garden-note", title: "Notice growth", detail: "Write what changed.", kind: "reflection" }];
    expect((await call("POST", `/v1/activities/${a.id}/accept`, { revision: plan.revision })).statusCode).toBe(200);
    setNow(new Date(Date.parse(a.start) + 60_000).toISOString());
    const event = { clientEventId: randomUUID(), activityId: a.id, outcome: "completed", occurredAt: new Date(Date.parse(a.start) + 60_000).toISOString(), missionIds: ["garden-note"], feedback: "I enjoyed the quiet." };
    expect((await call("POST", "/v1/completions/sync", { events: [event] })).statusCode).toBe(422);
    const note = "The basil has two new leaves.";
    expect((await call("POST", "/v1/completions/sync", { events: [{ ...event, missionNotes: { "garden-note": note } }] })).statusCode).toBe(200);
    expect((await call("GET", `/v1/plans/${schedule.weekStart}`)).json<Plan>().activities[0].missionNotes?.["garden-note"]).toBe(note);
    expect((await call("GET", `/v1/plans/${schedule.weekStart}`)).json<Plan>().activities[0].feedback).toBe("I enjoyed the quiet.");
    await app.close();
  });
  it("requires a vision verdict before a photo mission can be claimed", async () => {
    let match = false;
    const { app, call, store, plan, setNow } = await planned(async () => ({ match, reason: match ? "Plant visible." : "No clear plant." }));
    const a = plan.activities[0];
    const owner = [...store.users.values()][0];
    owner.plans[schedule.weekStart].activities[0].missions = [{ id: "plant-photo", title: "Photograph a plant", detail: "Take a photo.", kind: "photo", targetId: "plant" }];
    expect((await call("POST", `/v1/activities/${a.id}/accept`, { revision: plan.revision })).statusCode).toBe(200);
    setNow(new Date(Date.parse(a.start) + 60_000).toISOString());
    const event = {
      clientEventId: randomUUID(), activityId: a.id, outcome: "completed",
      occurredAt: new Date(Date.parse(a.start) + 60_000).toISOString(), missionIds: ["plant-photo"],
    };
    expect((await call("POST", "/v1/completions/sync", { events: [event] })).statusCode).toBe(422);
    const imageBase64 = (await sharp({ create: { width: 64, height: 64, channels: 3, background: "green" } }).jpeg().toBuffer()).toString("base64");
    const url = `/v1/activities/${a.id}/missions/plant-photo/verify`;
    const checked = await call("POST", url, { imageBase64, targetId: "plant" });
    expect(checked.statusCode).toBe(200);
    expect(checked.json().verified).toBe(false);
    expect((await call("POST", "/v1/completions/sync", { events: [event] })).statusCode).toBe(422);
    match = true;
    const accepted = await call("POST", url, { imageBase64, targetId: "tree" });
    expect(accepted.json().verified).toBe(true);
    expect((await call("POST", "/v1/completions/sync", { events: [event] })).statusCode).toBe(200);
    expect((await call("GET", `/v1/plans/${schedule.weekStart}`)).json<Plan>().activities[0].photoVerifications?.["plant-photo"].targetId).toBe("tree");
    expect(JSON.stringify([...store.users.values()][0])).not.toContain(imageBase64);
    await app.close();
  });
  it("keeps nearby lookup owner-scoped and works without location", async () => {
    const { app, call } = await setup();
    const response = await call("GET", "/v1/places/nearby");
    expect(response.json()).toMatchObject({
      places: [],
      locationAvailable: false,
    });
    expect(
      (await app.inject({ method: "GET", url: "/v1/places/nearby" }))
        .statusCode,
    ).toBe(401);
    await app.close();
  });
  it("refuses to publish a generation after its schedule changes", async () => {
    const { app, call, tick } = await setup((store) => {
      const user = [...store.users.values()][0];
      user.schedules[schedule.weekStart].version++;
    });
    const { runId } = (
      await call("POST", "/v1/plans/generate", {
        weekStart: schedule.weekStart,
      })
    ).json();
    await tick();
    expect((await call("GET", `/v1/planner-runs/${runId}`)).json().status).toBe(
      "failed",
    );
    expect(
      (await call("GET", `/v1/plans/${schedule.weekStart}`)).json(),
    ).toBeNull();
    await app.close();
  });
  it("revalidates overlap even if a caller supplies the latest revision", async () => {
    const { app, call, store, plan } = await planned();
    const user = [...store.users.values()][0];
    const a = plan.activities[0];
    const duplicate = { ...a, id: randomUUID() };
    user.plans[schedule.weekStart].activities.push(duplicate);
    await call("POST", `/v1/activities/${a.id}/accept`, {
      revision: plan.revision,
    });
    const response = await call(
      "POST",
      `/v1/activities/${duplicate.id}/accept`,
      { revision: plan.revision + 1 },
    );
    expect(response.statusCode).toBe(422);
    await app.close();
  });
  it("requires auth and isolates users", async () => {
    const { app, call, plan } = await planned();
    expect((await app.inject("/v1/me")).statusCode).toBe(401);
    const second = (
      await app.inject({ method: "POST", url: "/v1/sessions/guest" })
    ).json();
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/v1/activities/${plan.activities[0].id}/accept`,
          headers: { authorization: `Bearer ${second.token}` },
          payload: { revision: plan.revision },
        })
      ).statusCode,
    ).toBe(404);
    await app.close();
  });
  it("uses optimistic versions for schedule edits", async () => {
    const { app, call } = await setup();
    expect(
      (await call("PUT", `/v1/schedules/${schedule.weekStart}`, schedule))
        .statusCode,
    ).toBe(409);
    await app.close();
  });
  it("concurrent acceptance cannot silently update the same revision twice", async () => {
    const { app, call, plan } = await planned();
    const result = await Promise.all(
      plan.activities.slice(0, 2).map((a) =>
        call("POST", `/v1/activities/${a.id}/accept`, {
          revision: plan.revision,
        }),
      ),
    );
    expect(result.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    await app.close();
  });
  it("schedule changes invalidate suggestions and preserve accepted activities", async () => {
    const { app, call, plan } = await planned();
    const a = plan.activities[0];
    expect(
      (
        await call("POST", `/v1/activities/${a.id}/accept`, {
          revision: plan.revision,
        })
      ).statusCode,
    ).toBe(200);
    await call("PUT", `/v1/schedules/${schedule.weekStart}`, {
      ...schedule,
      version: 1,
      blocks: [
        {
          id: "busy",
          day: 0,
          start: "08:00",
          end: "20:00",
          kind: "work",
          nextDay: false,
        },
      ],
    });
    const fresh = (
      await call("GET", `/v1/plans/${schedule.weekStart}`)
    ).json<Plan>();
    expect(fresh.activities.find((x) => x.id === a.id)?.state).toBe(
      "needs_review",
    );
    expect(
      fresh.activities
        .filter((x) => x.id !== a.id)
        .every((x) => x.state === "replaced"),
    ).toBe(true);
    await app.close();
  });
  it("deduplicates completion retries and does not double count different event IDs", async () => {
    const { app, call, plan, setNow } = await planned();
    const a = plan.activities[0];
    await call("POST", `/v1/activities/${a.id}/accept`, {
      revision: plan.revision,
    });
    setNow(a.end);
    const event = {
      clientEventId: randomUUID(),
      activityId: a.id,
      outcome: "completed",
      occurredAt: a.end,
    };
    for (const body of [
      event,
      event,
      { ...event, clientEventId: randomUUID() },
    ])
      expect(
        (await call("POST", "/v1/completions/sync", { events: [body] }))
          .statusCode,
      ).toBe(200);
    expect((await call("GET", "/v1/history")).json().completed).toBe(1);
    expect(
      (
        await call("POST", "/v1/completions/sync", {
          events: [{ ...event, outcome: "skipped" }],
        })
      ).statusCode,
    ).toBe(409);
    await app.close();
  });
  it("stores checked mini missions with a completion and rejects invented ones", async () => {
    const { app, call, plan } = await planned();
    const activity = plan.activities[0];
    const missionId = activity.missions![0].id;
    const invalid = await call("POST", "/v1/completions/sync", {
      events: [{
        clientEventId: randomUUID(),
        activityId: activity.id,
        outcome: "skipped",
        occurredAt: initialNow,
        missionIds: ["invented"],
      }],
    });
    expect(invalid.statusCode).toBe(422);
    const valid = await call("POST", "/v1/completions/sync", {
      events: [{
        clientEventId: randomUUID(),
        activityId: activity.id,
        outcome: "skipped",
        occurredAt: initialNow,
        missionIds: [missionId],
      }],
    });
    expect(valid.statusCode).toBe(200);
    const saved = (await call("GET", `/v1/plans/${schedule.weekStart}`)).json<Plan>();
    expect(saved.activities.find((item) => item.id === activity.id)?.completedMissionIds).toEqual([missionId]);
    await app.close();
  });
  it("deduplicates active generation and recovers an expired lease", async () => {
    const { app, call, store, tick } = await setup();
    const a = (
      await call("POST", "/v1/plans/generate", {
        weekStart: schedule.weekStart,
      })
    ).json();
    const b = (
      await call("POST", "/v1/plans/generate", {
        weekStart: schedule.weekStart,
      })
    ).json();
    expect(a.runId).toBe(b.runId);
    const user = [...store.users.values()][0];
    user.runs[0].status = "running";
    user.runs[0].leaseUntil = "2000-01-01T00:00:00Z";
    await tick();
    expect(
      (await call("GET", `/v1/planner-runs/${a.runId}`)).json().status,
    ).toBe("succeeded");
    await app.close();
  });
  it("checks expiry explicitly without depending on TTL cleanup", async () => {
    const { app, call, setNow } = await setup();
    setNow("2031-01-01T00:00:00Z");
    expect((await call("GET", "/v1/me")).statusCode).toBe(401);
    await app.close();
  });
  it("deletion revokes sessions and removes user state", async () => {
    const { app, call, store } = await setup();
    expect((await call("DELETE", "/v1/me")).statusCode).toBe(200);
    expect((await call("GET", "/v1/me")).statusCode).toBe(401);
    expect(await store.ids()).toHaveLength(0);
    await app.close();
  });
});
