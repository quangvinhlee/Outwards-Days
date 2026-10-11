import assert from "node:assert/strict";
const base = (process.env.API_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3100}`).replace(/\/$/, "");
let token;
async function call(path, method = "GET", body) {
  const r = await fetch(base + path, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const data = await r.json();
  if (!r.ok)
    throw new Error(`${method} ${path}: ${r.status} ${data.error?.code}`);
  return data;
}
try {
  const guest = await call("/v1/sessions/guest", "POST");
  token = guest.token;
  const me = await call("/v1/me");
  await call("/v1/me/preferences", "PATCH", {
    ...me.preferences,
    area: "Melbourne",
    daysPerWeek: 2,
  });
  const schedule = {
    weekStart: me.weekStart,
    timezone: me.preferences.timezone,
    version: 0,
    confirmedDays: [0, 1, 2, 3, 4, 5, 6],
    blocks: [],
    windows: Array.from({ length: 7 }, (_, day) => ({
      day,
      start: "07:00",
      end: "22:00",
    })),
  };
  await call(`/v1/schedules/${me.weekStart}`, "PUT", schedule);
  const { runId } = await call("/v1/plans/generate", "POST", {
    weekStart: me.weekStart,
  });
  let run;
  for (let i = 0; i < 150; i++) {
    run = await call(`/v1/planner-runs/${runId}`);
    if (["succeeded", "failed"].includes(run.status)) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  assert.equal(run.status, "succeeded", run.error);
  let plan = await call(`/v1/plans/${me.weekStart}`);
  assert.equal(
    plan.model,
    process.env.OLLAMA_MODEL,
    "Generated plan used a different model",
  );
  assert.ok(
    plan.activities.length > 0,
    "Expected at least one future activity",
  );
  const first = plan.activities[0];
  plan = await call(`/v1/activities/${first.id}/accept`, "POST", {
    revision: plan.revision,
  });
  assert.equal(
    plan.activities.find((a) => a.id === first.id).state,
    "accepted",
  );
  // A synthetic skip tests the sync path without claiming an actual outdoor completion.
  const event = {
    clientEventId: crypto.randomUUID(),
    activityId: first.id,
    outcome: "skipped",
    occurredAt: new Date().toISOString(),
    feedback: "Automated setup check; no real outing claimed.",
  };
  const one = await call("/v1/completions/sync", "POST", { events: [event] });
  const two = await call("/v1/completions/sync", "POST", { events: [event] });
  assert.deepEqual(one, two);
  const history = await call("/v1/history");
  assert.equal(history.completed, 0);
  console.log(
    JSON.stringify({
      result: "passed",
      storage: "configured database",
      generationSource: plan.source,
      model: plan.model,
      activities: plan.activities.length,
      accepted: true,
      idempotentSync: true,
      realOutdoorActivity: false,
    }),
  );
} finally {
  if (token) await call("/v1/me", "DELETE");
}
