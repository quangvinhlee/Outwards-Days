import type { Completion, Plan, Preferences, Schedule } from "@outsideweek/contracts";

export type Snapshot = {
  preferences: Preferences;
  weekStart: string;
  confirmed: boolean;
  plans: Plan[];
  schedule: Schedule | null;
};
export type Queued = {
  id: string;
  event: Completion;
  status: "pending" | "blocked";
  error?: string;
};
const prefix = "outsideweek.";
export async function read<T>(key: string): Promise<T | undefined> {
  const value = localStorage.getItem(prefix + key);
  return value === null ? undefined : JSON.parse(value);
}
export async function write(key: string, value: unknown) {
  localStorage.setItem(prefix + key, JSON.stringify(value));
}
export async function enqueue(event: Completion) {
  const items = await queue();
  if (!items.some((item) => item.id === event.clientEventId)) {
    items.push({ id: event.clientEventId, event, status: "pending" });
    await write("outbox", items);
  }
}
export async function queue(): Promise<Queued[]> {
  return (await read<Queued[]>("outbox")) ?? [];
}
export async function acknowledge(id: string) {
  await write("outbox", (await queue()).filter((item) => item.id !== id));
}
export async function block(item: Queued, error: string) {
  await write("outbox", (await queue()).map((entry) =>
    entry.id === item.id ? { ...entry, status: "blocked", error } : entry,
  ));
}
export async function clear() {
  for (const key of Object.keys(localStorage))
    if (key.startsWith(prefix)) localStorage.removeItem(key);
}
