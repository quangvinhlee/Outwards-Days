import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";
import * as Crypto from "expo-crypto";
import { DateTime } from "luxon";
import {
  defaultPreferences,
  type Activity,
  type Completion,
  type Plan,
  type Preferences,
  type Run,
  type Schedule,
} from "@outsideweek/contracts";
import {
  api,
  ApiError,
  removeSession,
  saveSession,
  session,
  startSession,
} from "./api";
import * as storage from "./storage";
import { cancelReminder, reconcileReminders } from "./reminders";
const initial: storage.Snapshot = {
  preferences: defaultPreferences(),
  weekStart: "",
  confirmed: false,
  plans: [],
  schedule: null,
};
function localWeek(p: Preferences) {
  const d = DateTime.now().setZone(p.timezone).startOf("day");
  return d.minus({ days: (d.weekday - p.weekStartsOn + 7) % 7 }).toISODate()!;
}
function useStore() {
  const [data, setData] = useState(initial),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [pending, setPending] = useState<storage.Queued[]>([]),
    [busy, setBusy] = useState(false),
    [runId, setRunId] = useState<string | undefined>(),
    [later, setLater] = useState(false);
  const syncing = useRef<Promise<void> | null>(null),
    dataRef = useRef(data);
  dataRef.current = data;
  async function commit(next: storage.Snapshot) {
    await storage.write("snapshot", next);
    setData(next);
    dataRef.current = next;
  }
  async function refresh(force = false): Promise<void> {
    if (syncing.current) {
      await syncing.current;
      if (!force) return;
    }
    const pendingRefresh = performRefresh();
    syncing.current = pendingRefresh;
    try {
      await pendingRefresh;
    } finally {
      if (syncing.current === pendingRefresh) syncing.current = null;
    }
  }
  async function performRefresh() {
    try {
      const guest = await session();
      if (!guest) {
        if (await storage.read("snapshot"))
          throw new Error(
            "The guest session is missing. Your cached data is preserved.",
          );
        return;
      }
      for (const item of await storage.queue()) {
        if (item.status === "blocked") continue;
        try {
          const result = await api<{ acknowledged: string[] }>(
            "/v1/completions/sync",
            "POST",
            { events: [item.event] },
          );
          if (result.acknowledged.includes(item.id))
            await storage.acknowledge(item.id);
        } catch (e) {
          if (e instanceof ApiError && !e.retryable && e.status !== 0)
            await storage.block(item, e.message);
          else throw e;
        }
      }
      const me = await api<{
        preferences: Preferences;
        weekStart: string;
        confirmed: boolean;
      }>("/v1/me");
      const [history, schedule] = await Promise.all([
        api<{ plans: Plan[] }>("/v1/history"),
        api<Schedule | null>(`/v1/schedules/${me.weekStart}`),
      ]);
      await commit({ ...me, plans: history.plans, schedule });
      setError("");
      if (Date.parse(guest.expiresAt) - Date.now() < 7 * 86400000) {
        const renewed = await api<{ expiresAt: string }>(
          "/v1/sessions/renew",
          "POST",
        );
        await saveSession({ ...guest, ...renewed });
      }
      await reconcileReminders(history.plans, me.preferences).catch(() =>
        setError(
          "Your plan is saved. Reminders could not be updated on this device.",
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not refresh.");
    } finally {
      setPending(await storage.queue());
    }
  }
  useEffect(() => {
    let mounted = true;
    void (async () => {
      const cached = await storage.read<storage.Snapshot>("snapshot");
      if (cached && mounted) {
        const weekStart = localWeek(cached.preferences);
        setData({
          ...cached,
          weekStart,
          confirmed: weekStart === cached.weekStart && cached.confirmed,
          schedule: weekStart === cached.weekStart ? cached.schedule : null,
        });
      }
      setPending(await storage.queue());
      setRunId(await storage.read<string>("runId"));
      if (mounted) setReady(true);
      await refresh();
    })().catch((e) => {
      if (mounted) {
        setError(e instanceof Error ? e.message : "Could not open saved data.");
        setReady(true);
      }
    });
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        const current = dataRef.current;
        const weekStart = localWeek(current.preferences);
        if (current.weekStart !== weekStart) {
          setData({ ...current, weekStart, confirmed: false, schedule: null });
          setLater(false);
        }
        void refresh();
      }
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);
  useEffect(() => {
    if (!runId) return;
    let active = true;
    const poll = async () => {
      try {
        const run = await api<Run>(`/v1/planner-runs/${runId}`);
        if (!active) return;
        if (run.status === "succeeded" || run.status === "failed") {
          setRunId(undefined);
          await storage.write("runId", null);
          await refresh();
          if (run.status === "failed")
            setError(run.error ?? "Please generate again.");
        }
      } catch (e) {
        if (active)
          setError(e instanceof Error ? e.message : "Planning paused.");
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [runId]);
  async function action(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
      throw e;
    } finally {
      setBusy(false);
    }
  }
  async function preferences(p: Preferences) {
    await action(async () => {
      if (!(await session())) await startSession();
      await api("/v1/me/preferences", "PATCH", p);
      await refresh(true);
    });
  }
  async function confirm(s: Schedule) {
    await action(async () => {
      await api(`/v1/schedules/${s.weekStart}`, "PUT", s);
      await refresh(true);
    });
  }
  async function generate(weekStart = data.weekStart) {
    await action(async () => {
      const run = await api<{ runId: string }>("/v1/plans/generate", "POST", {
        weekStart,
      });
      await storage.write("runId", run.runId);
      setRunId(run.runId);
    });
  }
  async function activityAction(a: Activity, verb: string, extra: object = {}) {
    await action(async () => {
      const plan = data.plans.find((p) =>
        p.activities.some((x) => x.id === a.id),
      )!;
      await api(`/v1/activities/${a.id}/${verb}`, "POST", {
        revision: plan.revision,
        ...extra,
      });
      await refresh(true);
    });
  }
  async function verifyMissionPhoto(a: Activity, missionId: string, targetId: string, imageBase64: string) {
    const result = await api<{ verified: boolean; reason: string }>(
      `/v1/activities/${a.id}/missions/${missionId}/verify`, "POST", { targetId, imageBase64 }, 70000,
    );
    if (result.verified) await refresh(true);
    return result;
  }
  async function complete(
    a: Activity,
    outcome: Completion["outcome"],
    feedback: string,
    missionIds: string[] = [],
    missionNotes: Record<string, string> = {},
  ) {
    await storage.enqueue({
      clientEventId: Crypto.randomUUID(),
      activityId: a.id,
      outcome,
      occurredAt: new Date().toISOString(),
      ...(feedback ? { feedback } : {}),
      ...(missionIds.length ? { missionIds } : {}),
      ...(Object.keys(missionNotes).length ? { missionNotes } : {}),
    });
    setPending(await storage.queue());
    await cancelReminder(a.id);
    await refresh(true);
  }
  async function deleteData() {
    await action(async () => {
      await api("/v1/me", "DELETE");
      await reconcileReminders([], { ...data.preferences, reminders: false });
      await removeSession();
      await storage.clear();
      setData(initial);
      setPending([]);
      setRunId(undefined);
    });
  }
  const plans = data.plans.map((p) => ({
    ...p,
    activities: p.activities.map((a) => {
      const event = pending.find((q) => q.event.activityId === a.id);
      return event ? { ...a, state: event.event.outcome } : a;
    }),
  }));
  return {
    data: { ...data, plans },
    ready,
    error,
    setError,
    pending,
    busy,
    runId,
    later,
    setLater,
    refresh,
    preferences,
    confirm,
    generate,
    activityAction,
    verifyMissionPhoto,
    complete,
    deleteData,
  };
}
const Context = createContext<ReturnType<typeof useStore> | null>(null);
export function StoreProvider({ children }: { children: React.ReactNode }) {
  return <Context.Provider value={useStore()}>{children}</Context.Provider>;
}
export function useApp() {
  return useContext(Context)!;
}
export function newSchedule(weekStart: string, p: Preferences): Schedule {
  return {
    weekStart,
    timezone: p.timezone,
    version: 0,
    confirmedDays: [0, 1, 2, 3, 4, 5, 6],
    fullDays: Array.from({ length: 7 }, (_, day) => day).filter((day) =>
      DateTime.fromISO(weekStart).plus({ days: day }).weekday >= 6),
    blocks: Array.from({ length: 8 }, (_, i) => ({
      id: Crypto.randomUUID(),
      day: i - 1,
      start: "22:00",
      end: "07:00",
      nextDay: true,
      kind: "sleep" as const,
    })),
    windows: Array.from({ length: 7 }, (_, day) => ({
      day,
      start: "07:00",
      end: "20:00",
    })),
  };
}
