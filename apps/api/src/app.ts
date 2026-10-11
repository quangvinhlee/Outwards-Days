import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import cors from "@fastify/cors";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { DateTime, IANAZone } from "luxon";
import sharp from "sharp";
import { z } from "zod";
import {
  Completion,
  DateKey,
  Preferences,
  Schedule,
  defaultPreferences,
  missionsFor,
  photoTargets,
  type Activity,
  type Plan,
  type UserState,
} from "../../../packages/contracts/src/index.js";
import {
  PlannerError,
  basicPlan,
  personalizeMissions,
  revalidateActivity,
  reserved,
  slots,
  validateSchedule,
  weekKey,
} from "../../../packages/planner/src/index.js";
import { ApiError, mutate, type Store } from "./store.js";
import { forecast, destinations } from "./providers.js";
import { generate, type PlanningInput } from "./workflow.js";
import { PhotoRequest, verifyPhoto } from "./photo.js";
import { credentials, loginCredentials, passwordHash, passwordMatches } from "./auth.js";
const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const revisionBody = z.object({ revision: z.number().int().positive() });
const checked = (actual: number, expected: number) => {
  if (actual !== expected)
    throw new ApiError(
      409,
      "STALE_VERSION",
      "This has changed. Refresh before trying again.",
    );
};
function activityIn(s: UserState, id: string) {
  for (const plan of Object.values(s.plans)) {
    const activity = plan.activities.find((a) => a.id === id);
    if (activity) return { plan, activity };
  }
  throw new ApiError(404, "NOT_FOUND", "Activity not found.");
}
function invalidate(s: UserState, weekStart?: string) {
  for (const plan of Object.values(s.plans)) {
    if (weekStart && plan.weekStart !== weekStart) continue;
    for (const a of plan.activities) {
      if (a.state === "suggested") a.state = "replaced";
      if (a.state === "accepted") {
        try {
          revalidateActivity(
            a,
            s.schedules[plan.weekStart],
            s.preferences,
            plan.activities,
            new Date().toISOString(),
          );
        } catch {
          a.state = "needs_review";
        }
      }
    }
    plan.revision++;
  }
}
export async function buildApp(
  store: Store,
  options: {
    now?: () => string;
    generate?: typeof generate;
    verifyPhoto?: typeof verifyPhoto;
    logger?: boolean;
  } = {},
) {
  const now = options.now ?? (() => new Date().toISOString());
  const app = Fastify({
    logger: options.logger
      ? {
          redact: ["req.headers.authorization"],
          serializers: {
            req: (req) => ({ method: req.method, url: req.url.split("?")[0] }),
          },
        }
      : false,
    bodyLimit: 128 * 1024,
    requestIdHeader: false,
  });
  await app.register(cors, {
    origin: (origin, callback) => {
      const allowed = process.env.NODE_ENV === "production"
        ? origin === process.env.WEB_ORIGIN
        : !origin || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|(?:\d{1,3}\.){3}\d{1,3}):8083$/.test(origin);
      callback(null, allowed);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  });
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
  const owners = new WeakMap<object, string>();
  app.addHook("onRequest", async (req, reply) => {
    reply.header("x-request-id", req.id);
    const path = req.url.split("?")[0];
    if (["/healthz", "/v1/sessions/guest", "/v1/auth/login"].includes(path)) return;
    const token = /^Bearer ([A-Za-z0-9_-]+)$/.exec(req.headers.authorization ?? "")?.[1];
    if (path === "/v1/auth/register" && !req.headers.authorization) return;
    if (!token)
      throw new ApiError(
        401,
        "SESSION_REQUIRED",
        "Sign in or start a guest session.",
      );
    const session = await store.session(hash(token));
    if (
      !session ||
      session.expiresAt.getTime() <= Date.parse(now()) ||
      !(await store.get(session.userId))
    )
      throw new ApiError(
        401,
        "SESSION_EXPIRED",
        "Your session expired or is unavailable. Sign in again to recover account data.",
      );
    owners.set(req, session.userId);
  });
  app.setErrorHandler((error, req, reply) => {
    const status =
      error instanceof ApiError
        ? error.status
        : error instanceof z.ZodError || error instanceof PlannerError
          ? 422
          : ((error as { statusCode?: number }).statusCode ?? 500);
    reply.code(status).send({
      error: {
        code:
          error instanceof ApiError
            ? error.code
            : status === 422
              ? "INVALID_INPUT"
              : status === 429
                ? "RATE_LIMITED"
                : "REQUEST_FAILED",
        message:
          status >= 500
            ? "The request could not be completed. Please retry."
            : error instanceof Error
              ? error.message
              : "Request failed",
        retryable: status === 429 || status >= 500,
        requestId: req.id,
      },
    });
  });
  const owner = (req: object) => owners.get(req)!;
  const state = async (req: object) => (await store.get(owner(req)))!;
  const expiry = () =>
    new Date(
      Date.parse(now()) + Number(process.env.SESSION_TTL_DAYS || 30) * 86400000,
    );
  const newSession = async (userId: string, email?: string) => {
    const token = randomBytes(32).toString("base64url"), expiresAt = expiry();
    await store.saveSession({ hash: hash(token), userId, expiresAt });
    return { token, expiresAt: expiresAt.toISOString(), userId, ...(email ? { email } : {}) };
  };
  app.get("/healthz", async () => ({ status: "ok" }));
  app.post(
    "/v1/sessions/guest",
    { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } },
    async () => {
      const id = randomUUID();
      await store.create({
        id,
        revision: 0,
        preferences: defaultPreferences(),
        schedules: {},
        plans: {},
        runs: [],
        completions: [],
      });
      return newSession(id);
    },
  );
  app.post(
    "/v1/auth/register",
    { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } },
    async (req) => {
      const { email, password } = credentials.parse(req.body);
      const existingOwner = owners.get(req);
      if (existingOwner && await store.accountByUser(existingOwner))
        throw new ApiError(409, "ACCOUNT_EXISTS", "This profile already has an account.");
      if (await store.accountByEmail(email))
        throw new ApiError(409, "ACCOUNT_EXISTS", "An account already exists for this email.");
      const id = existingOwner ?? randomUUID();
      const account = { userId: id, email, passwordHash: await passwordHash(password), createdAt: now() };
      if (!existingOwner) await store.create({
        id, revision: 0, preferences: defaultPreferences(), schedules: {}, plans: {}, runs: [], completions: [],
      });
      try {
        await store.createAccount(account);
      } catch (error) {
        if (!existingOwner) await store.remove(id);
        throw error;
      }
      const result = await newSession(id, email);
      if (existingOwner) {
        const oldToken = /^Bearer ([A-Za-z0-9_-]+)$/.exec(req.headers.authorization ?? "")?.[1];
        if (oldToken) await store.removeSession(hash(oldToken));
      }
      return result;
    },
  );
  app.post(
    "/v1/auth/login",
    { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } },
    async (req) => {
      const { email, password } = loginCredentials.parse(req.body);
      const account = await store.accountByEmail(email);
      if (!account || !(await passwordMatches(password, account.passwordHash)) || !(await store.get(account.userId)))
        throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
      return newSession(account.userId, account.email);
    },
  );
  app.post("/v1/auth/logout", async (req) => {
    const token = /^Bearer ([A-Za-z0-9_-]+)$/.exec(req.headers.authorization ?? "")![1];
    await store.removeSession(hash(token));
    return { signedOut: true };
  });
  app.post("/v1/sessions/renew", async (req) => {
    const expiresAt = expiry();
    await store.saveSession({
      hash: hash(req.headers.authorization!.slice(7)),
      userId: owner(req),
      expiresAt,
    });
    return { expiresAt: expiresAt.toISOString() };
  });
  app.get("/v1/me", async (req) => {
    const s = await state(req);
    const account = await store.accountByUser(s.id);
    const weekStart = weekKey(now(), s.preferences);
    return {
      preferences: s.preferences,
      weekStart,
      confirmed: !!s.schedules[weekStart]?.confirmedAt,
      account: account ? { email: account.email } : null,
    };
  });
  app.patch("/v1/me/preferences", async (req) => {
    const p = Preferences.parse(req.body);
    if (!IANAZone.isValidZone(p.timezone))
      throw new PlannerError("Choose a valid IANA timezone.");
    return mutate(store, owner(req), (s) => {
      checked(s.preferences.version, p.version);
      const zoneChanged =
        s.preferences.timezone !== p.timezone ||
        s.preferences.weekStartsOn !== p.weekStartsOn;
      s.preferences = { ...p, version: p.version + 1 };
      if (zoneChanged) {
        for (const sch of Object.values(s.schedules)) delete sch.confirmedAt;
        for (const plan of Object.values(s.plans))
          for (const a of plan.activities)
            if (a.state === "accepted") a.state = "needs_review";
      }
      invalidate(s);
      return s.preferences;
    });
  });
  app.get<{ Params: { weekStart: string } }>(
    "/v1/schedules/:weekStart",
    async (req) => {
      const key = DateKey.parse(req.params.weekStart);
      return (await state(req)).schedules[key] ?? null;
    },
  );
  app.put<{ Params: { weekStart: string } }>(
    "/v1/schedules/:weekStart",
    async (req) => {
      const schedule = Schedule.parse(req.body);
      if (schedule.weekStart !== req.params.weekStart)
        throw new PlannerError("Week does not match.");
      return mutate(store, owner(req), (s) => {
        validateSchedule(schedule, s.preferences);
        checked(
          s.schedules[schedule.weekStart]?.version ?? 0,
          schedule.version,
        );
        s.schedules[schedule.weekStart] = {
          ...schedule,
          version: schedule.version + 1,
          confirmedAt: now(),
        };
        invalidate(s, schedule.weekStart);
        return s.schedules[schedule.weekStart];
      });
    },
  );
  app.post(
    "/v1/plans/generate",
    { config: { rateLimit: { max: 12, timeWindow: "1 hour" } } },
    async (req, reply) => {
      const { weekStart } = z.object({ weekStart: DateKey }).parse(req.body);
      const run = await mutate(store, owner(req), (s) => {
        const schedule = s.schedules[weekStart];
        if (
          !schedule?.confirmedAt ||
          schedule.timezone !== s.preferences.timezone
        )
          throw new PlannerError(
            "Confirm this week in your current timezone first.",
          );
        const inputKey = `${schedule.version}:${s.preferences.version}:${s.plans[weekStart]?.revision ?? 0}`;
        const active = s.runs.find(
          (r) =>
            r.weekStart === weekStart &&
            ["queued", "running"].includes(r.status),
        );
        if (active) return active;
        const run = {
          id: randomUUID(),
          weekStart,
          inputKey,
          status: "queued" as const,
          attempts: 0,
          createdAt: now(),
        };
        s.runs.push(run);
        return run;
      });
      return reply.code(202).send({ runId: run.id });
    },
  );
  app.get<{ Params: { runId: string } }>(
    "/v1/planner-runs/:runId",
    async (req) => {
      const run = (await state(req)).runs.find(
        (r) => r.id === req.params.runId,
      );
      if (!run) throw new ApiError(404, "NOT_FOUND", "Planning run not found.");
      return run;
    },
  );
  app.get<{ Params: { weekStart: string } }>(
    "/v1/plans/:weekStart",
    async (req) =>
      (await state(req)).plans[DateKey.parse(req.params.weekStart)] ?? null,
  );
  app.post<{ Params: { id: string } }>(
    "/v1/activities/:id/accept",
    async (req) => {
      const body = revisionBody.parse(req.body);
      return mutate(store, owner(req), (s) => {
        const { plan, activity: a } = activityIn(s, req.params.id);
        checked(plan.revision, body.revision);
        if (a.state === "accepted") return plan;
        if (!["suggested", "needs_review"].includes(a.state))
          throw new PlannerError("This activity can no longer be accepted.");
        const schedule = s.schedules[plan.weekStart];
        if (!schedule?.confirmedAt)
          throw new PlannerError("Confirm your schedule first.");
        if (
          a.state === "suggested" &&
          (a.scheduleVersion !== schedule.version ||
            a.preferenceVersion !== s.preferences.version)
        )
          throw new ApiError(
            409,
            "STALE_SUGGESTION",
            "Generate suggestions for your updated schedule.",
          );
        if (
          a.long &&
          (!a.weather.fetchedAt ||
            Date.parse(now()) - Date.parse(a.weather.fetchedAt) > 1800000)
        )
          throw new PlannerError(
            "Refresh conditions before accepting a longer outing.",
          );
        revalidateActivity(a, schedule, s.preferences, plan.activities, now());
        a.state = "accepted";
        plan.revision++;
        return plan;
      });
    },
  );
  app.post<{ Params: { id: string } }>(
    "/v1/activities/:id/replace",
    async (req) => {
      const body = revisionBody.parse(req.body);
      return mutate(store, owner(req), (s) => {
        const { plan, activity: a } = activityIn(s, req.params.id);
        checked(plan.revision, body.revision);
        if (!["suggested", "accepted", "needs_review"].includes(a.state))
          throw new PlannerError("This activity cannot be replaced.");
        const schedule = s.schedules[plan.weekStart];
        if (!schedule.confirmedAt)
          throw new PlannerError("Confirm your schedule first.");
        const existing = plan.activities.filter((x) => x.id !== a.id);
        const free = slots(schedule, s.preferences, existing, now()).filter(
          (x) => x.localDate === a.localDate,
        );
        const history = Object.values(s.plans).flatMap((p) => p.activities);
        const next = personalizeMissions(basicPlan(
          free,
          s.preferences,
          schedule,
          a.weather,
          existing,
          now(),
          a.templateId,
          {
            places: plan.destinations,
            history,
          },
        ), history)[0];
        if (!next)
          throw new PlannerError(
            "No alternative fits that day. Change your schedule or preferences.",
          );
        a.state = "replaced";
        plan.activities.push(next);
        plan.source = "basic";
        plan.notice =
          "Replacement chosen from the basic catalogue and checked against your current schedule.";
        plan.revision++;
        return plan;
      });
    },
  );
  app.post<{ Params: { id: string } }>(
    "/v1/activities/:id/reschedule",
    async (req) => {
      const body = revisionBody
        .extend({ start: z.string().datetime() })
        .parse(req.body);
      return mutate(store, owner(req), (s) => {
        const { plan, activity: a } = activityIn(s, req.params.id);
        checked(plan.revision, body.revision);
        if (!["suggested", "accepted", "needs_review"].includes(a.state))
          throw new PlannerError("This activity cannot be moved.");
        if (!s.schedules[plan.weekStart].confirmedAt)
          throw new PlannerError("Confirm the schedule first.");
        a.start = body.start;
        a.end = new Date(
          Date.parse(body.start) + a.totalMinutes * 60000,
        ).toISOString();
        a.localDate = DateTime.fromISO(a.start)
          .setZone(s.preferences.timezone)
          .toISODate()!;
        revalidateActivity(
          a,
          s.schedules[plan.weekStart],
          s.preferences,
          plan.activities,
          now(),
        );
        a.state = "suggested";
        a.scheduleVersion = s.schedules[plan.weekStart].version;
        a.preferenceVersion = s.preferences.version;
        plan.revision++;
        return plan;
      });
    },
  );
  app.post<{ Params: { id: string } }>(
    "/v1/activities/:id/refresh-conditions",
    async (req) => {
      const snapshot = await state(req);
      activityIn(snapshot, req.params.id);
      const weather = await forecast(snapshot.preferences);
      return mutate(store, owner(req), (s) => {
        checked(s.preferences.version, snapshot.preferences.version);
        const { plan, activity: a } = activityIn(s, req.params.id);
        a.weather = weather;
        if (a.state === "accepted") {
          try {
            revalidateActivity(
              a,
              s.schedules[plan.weekStart],
              s.preferences,
              plan.activities,
              now(),
            );
          } catch {
            a.state = "needs_review";
          }
        }
        plan.revision++;
        return plan;
      });
    },
  );
  app.post<{ Params: { id: string; missionId: string } }>(
    "/v1/activities/:id/missions/:missionId/verify",
    { bodyLimit: 2_000_000, config: { rateLimit: { max: 8, timeWindow: "1 hour" } } },
    async (req) => {
      const { imageBase64, targetId } = PhotoRequest.parse(req.body);
      const image = Buffer.from(imageBase64, "base64");
      if (image.length < 100 || image.length > 1_200_000 || image[0] !== 0xff || image[1] !== 0xd8 || image[image.length - 2] !== 0xff || image[image.length - 1] !== 0xd9)
        throw new PlannerError("Take a JPEG photo under 1.2 MB and try again.");
      if (image.toString("base64") !== imageBase64)
        throw new PlannerError("The photo data is invalid.");
      const snapshot = await state(req);
      const { activity } = activityIn(snapshot, req.params.id);
      const mission = (activity.missions ?? missionsFor(activity.category, activity.localDate, activity.destination?.name, activity.activityMinutes))
        .find((item) => item.id === req.params.missionId);
      if (!mission || mission.kind !== "photo")
        throw new PlannerError("This outing has no photo mission with that ID.");
      if (!["accepted", "needs_review"].includes(activity.state) || Date.parse(now()) < Date.parse(activity.start))
        throw new PlannerError("Start this accepted outing before checking a photo mission.");
      if (!photoTargets.some((target) => target.id === targetId))
        throw new PlannerError("Choose a listed photo subject.");
      let prepared: string;
      try {
        prepared = (await sharp(image, { limitInputPixels: 20_000_000 })
          .rotate()
          .resize({ width: 768, height: 768, fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 75 })
          .toBuffer()).toString("base64");
      } catch {
        throw new PlannerError("This photo could not be read. Take a new picture and try again.");
      }
      const verdict = await (options.verifyPhoto ?? verifyPhoto)(prepared, targetId);
      if (!verdict.match) return { verified: false, reason: verdict.reason };
      const verification = await mutate(store, owner(req), (s) => {
        const { plan, activity: current } = activityIn(s, req.params.id);
        if (!["accepted", "needs_review"].includes(current.state))
          throw new PlannerError("This outing is no longer open.");
        if (!(current.missions ?? []).some((item) => item.id === req.params.missionId && item.kind === "photo"))
          throw new PlannerError("This photo mission changed. Refresh and try again.");
        current.photoVerifications ??= {};
        current.photoVerifications[req.params.missionId] = { targetId, verifiedAt: now() };
        plan.revision++;
        return current.photoVerifications[req.params.missionId];
      });
      return { verified: true, reason: verdict.reason, verification };
    },
  );
  app.post("/v1/completions/sync", async (req) => {
    const { events } = z
      .object({ events: z.array(Completion).min(1).max(50) })
      .parse(req.body);
    return mutate(store, owner(req), (s) => {
      const acknowledgements = events.map((event) => {
        const previous = s.completions.find(
          (e) => e.clientEventId === event.clientEventId,
        );
        if (previous) {
          if (JSON.stringify(previous) !== JSON.stringify(event))
            throw new ApiError(
              409,
              "EVENT_CONFLICT",
              "This event ID was already used for a different completion.",
            );
          return previous.clientEventId;
        }
        const { plan, activity: a } = activityIn(s, event.activityId);
        const availableMissions = a.missions ?? missionsFor(a.category, a.localDate, a.destination?.name, a.activityMinutes);
        if ((event.missionIds ?? []).some((id) => !availableMissions.some((mission) => mission.id === id)) ||
          new Set(event.missionIds ?? []).size !== (event.missionIds ?? []).length)
          throw new PlannerError("A checked mini mission does not belong to this outing.");
        if ((event.missionIds ?? []).some((id) => availableMissions.find((mission) => mission.id === id)?.kind === "photo" && !a.photoVerifications?.[id]))
          throw new PlannerError("A photo mission needs a successful photo check first.");
        const notes = event.missionNotes ?? {};
        if (Object.keys(notes).length > 3 || Object.keys(notes).some((id) =>
          !event.missionIds?.includes(id) || availableMissions.find((mission) => mission.id === id)?.kind !== "reflection") ||
          (event.missionIds ?? []).some((id) => availableMissions.find((mission) => mission.id === id)?.kind === "reflection" && !notes[id]))
          throw new PlannerError("A written mission needs its own saved note.");
        if (Date.parse(event.occurredAt) > Date.parse(now()) + 300000)
          throw new PlannerError("Completion time is in the future.");
        if (
          event.outcome !== "skipped" &&
          Date.parse(event.occurredAt) < Date.parse(a.start)
        )
          throw new PlannerError("This activity has not started yet.");
        if (["completed", "partly_completed", "skipped"].includes(a.state)) {
          if (a.state !== event.outcome)
            throw new PlannerError(
              "This activity already has a different outcome.",
            );
          if (JSON.stringify(a.completedMissionIds ?? []) !== JSON.stringify(event.missionIds ?? []))
            throw new PlannerError("This outing already has a different mission checklist.");
          if (JSON.stringify(a.missionNotes ?? {}) !== JSON.stringify(notes))
            throw new PlannerError("This outing already has different written notes.");
        } else {
          if (
            event.outcome === "skipped"
              ? !["suggested", "accepted", "needs_review"].includes(a.state)
              : !["accepted", "needs_review"].includes(a.state)
          )
            throw new PlannerError(
              "Accept this activity before recording a completion.",
            );
          a.state = event.outcome;
          a.completedMissionIds = event.missionIds ?? [];
          a.missionNotes = notes;
          a.feedback = event.feedback;
          plan.revision++;
        }
        s.completions.push(event);
        return event.clientEventId;
      });
      return { acknowledged: acknowledgements };
    });
  });
  app.get("/v1/history", async (req) => {
    const s = await state(req);
    const plans = Object.values(s.plans).sort((a, b) =>
      b.weekStart.localeCompare(a.weekStart),
    );
    return {
      plans,
      completed: plans
        .flatMap((p) => p.activities)
        .filter((a) => ["completed", "partly_completed"].includes(a.state))
        .length,
    };
  });
  app.get(
    "/v1/places/nearby",
    { config: { rateLimit: { max: 12, timeWindow: "1 hour" } } },
    async (req) => {
      const s = await state(req);
      return {
        places: await destinations(s.preferences),
        locationAvailable:
          s.preferences.latitude !== undefined &&
          s.preferences.longitude !== undefined,
      };
    },
  );
  app.delete("/v1/me", async (req) => {
    await store.remove(owner(req));
    return { deleted: true };
  });
  let working = false;
  async function tick() {
    if (working) return;
    working = true;
    try {
      for (const id of await store.ids()) {
        const snapshot = await store.get(id);
        if (
          !snapshot?.runs.some(
            (r) =>
              r.status === "queued" ||
              (r.status === "running" &&
                Date.parse(r.leaseUntil ?? "") < Date.parse(now())),
          )
        )
          continue;
        const leaseToken = randomUUID();
        const claimed = await mutate(store, id, (s) => {
          const r = s.runs.find(
            (r) =>
              r.status === "queued" ||
              (r.status === "running" &&
                Date.parse(r.leaseUntil ?? "") < Date.parse(now())),
          );
          if (!r) return null;
          if (r.attempts >= 3) {
            r.status = "failed";
            r.error =
              "Planning stopped after repeated interruptions. Please retry.";
            return null;
          }
          r.status = "running";
          r.attempts++;
          r.leaseUntil = new Date(Date.parse(now()) + 300000).toISOString();
          r.leaseToken = leaseToken;
          return structuredClone({
            run: r,
            schedule: s.schedules[r.weekStart],
            preferences: s.preferences,
            existing: s.plans[r.weekStart]?.activities ?? [],
            history: Object.values(s.plans)
              .flatMap((p) => p.activities.filter((activity) =>
                p.weekStart !== r.weekStart || ["completed", "partly_completed", "skipped"].includes(activity.state)))
              .map((activity) => ({
                ...activity,
                feedback: activity.feedback ?? s.completions.find((event) =>
                  event.activityId === activity.id)?.feedback,
              })),
            planRevision: s.plans[r.weekStart]?.revision ?? 0,
          });
        });
        if (!claimed) continue;
        try {
          const result = await (options.generate ?? generate)({
            schedule: claimed.schedule,
            preferences: claimed.preferences,
            existing: claimed.existing,
            history: claimed.history,
            now: now(),
          });
          await mutate(store, id, (s) => {
            const r = s.runs.find((r) => r.id === claimed.run.id)!;
            if (r.leaseToken !== leaseToken || r.status !== "running") return;
            const schedule = s.schedules[r.weekStart];
            if (
              !schedule?.confirmedAt ||
              schedule.version !== claimed.schedule.version ||
              s.preferences.version !== claimed.preferences.version ||
              (s.plans[r.weekStart]?.revision ?? 0) !== claimed.planRevision
            ) {
              r.status = "failed";
              r.error =
                "Your schedule or activities changed while planning. Generate again.";
              return;
            }
            const plan: Plan = {
              ...result,
              revision: claimed.planRevision + 1,
            };
            s.plans[r.weekStart] = plan;
            r.status = "succeeded";
            r.planRevision = plan.revision;
          });
        } catch {
          try {
            await mutate(store, id, (s) => {
              const r = s.runs.find((r) => r.id === claimed.run.id);
              if (r?.leaseToken === leaseToken) {
                r.status = "failed";
                r.error =
                  "Planning was interrupted. Your saved schedule is unchanged; please retry.";
              }
            });
          } catch {
            /* User may have deleted their data during inference. */
          }
        }
        break;
      }
    } finally {
      working = false;
    }
  }
  return { app, tick };
}
