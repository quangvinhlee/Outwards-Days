import * as SQLite from "expo-sqlite";
import type {
  Completion,
  UserState,
  Plan,
  Preferences,
  Schedule,
} from "@outsideweek/contracts";
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
let opening: Promise<SQLite.SQLiteDatabase> | undefined;
async function db() {
  return (opening ??= SQLite.openDatabaseAsync("outsideweek.db").then(
    async (db) => {
      await db.execAsync(
        "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY, value TEXT NOT NULL);",
      );
      return db;
    },
  ));
}
export async function read<T>(key: string): Promise<T | undefined> {
  const row = await (
    await db()
  ).getFirstAsync<{ value: string }>("SELECT value FROM kv WHERE key=?", key);
  return row ? JSON.parse(row.value) : undefined;
}
export async function write(key: string, value: unknown) {
  await (
    await db()
  ).runAsync(
    "INSERT OR REPLACE INTO kv(key,value) VALUES (?,?)",
    key,
    JSON.stringify(value),
  );
}
export async function enqueue(event: Completion) {
  await (
    await db()
  ).runAsync(
    "INSERT OR IGNORE INTO outbox(id,value) VALUES (?,?)",
    event.clientEventId,
    JSON.stringify({ id: event.clientEventId, event, status: "pending" }),
  );
}
export async function queue(): Promise<Queued[]> {
  return (
    await (
      await db()
    ).getAllAsync<{ value: string }>("SELECT value FROM outbox")
  ).map((row) => JSON.parse(row.value));
}
export async function acknowledge(id: string) {
  await (await db()).runAsync("DELETE FROM outbox WHERE id=?", id);
}
export async function block(item: Queued, error: string) {
  await (
    await db()
  ).runAsync(
    "UPDATE outbox SET value=? WHERE id=?",
    JSON.stringify({ ...item, status: "blocked", error }),
    item.id,
  );
}
export async function clear() {
  await (await db()).execAsync("DELETE FROM kv; DELETE FROM outbox;");
}
