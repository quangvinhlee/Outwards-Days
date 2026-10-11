import { MongoClient, type Collection } from "mongodb";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Preferences, missionsFor, type UserState } from "../../../packages/contracts/src/index.js";
function currentState(s: UserState): UserState {
  for (const plan of Object.values(s.plans))
    for (const activity of plan.activities) {
      const current = missionsFor(
        activity.category,
        activity.localDate,
        activity.destination?.name,
        activity.activityMinutes,
      );
      activity.missions = (activity.missions ?? current).map((mission) => {
        const catalogued = current.find((item) => item.id === mission.id);
        return { ...mission, kind: catalogued?.kind ?? mission.kind ?? (mission.id.endsWith("-photo") ? "photo" as const : "action" as const), targetId: catalogued?.targetId ?? mission.targetId };
      });
      activity.completedMissionIds = activity.completedMissionIds?.filter((id) => activity.missions?.find((mission) => mission.id === id)?.kind !== "photo" || !!activity.photoVerifications?.[id]);
    }
  return { ...s, preferences: Preferences.parse(s.preferences) };
}
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export type Session = { hash: string; userId: string; expiresAt: Date };
export interface Store {
  create(state: UserState): Promise<void>;
  get(id: string): Promise<UserState | undefined>;
  ids(): Promise<string[]>;
  cas(state: UserState, revision: number): Promise<boolean>;
  remove(id: string): Promise<void>;
  session(hash: string): Promise<Session | undefined>;
  saveSession(session: Session): Promise<void>;
  close(): Promise<void>;
}
export async function mutate<T>(
  store: Store,
  id: string,
  fn: (s: UserState) => T,
): Promise<T> {
  for (let tries = 0; tries < 20; tries++) {
    const state = await store.get(id);
    if (!state)
      throw new ApiError(
        401,
        "SESSION_UNAVAILABLE",
        "Your guest identity is unavailable. Saved local data has been preserved.",
      );
    const previous = state.revision;
    const result = fn(state);
    state.revision++;
    if (await store.cas(state, previous)) return result;
  }
  throw new ApiError(
    409,
    "CONFLICT",
    "Another update is in progress. Refresh and retry.",
  );
}
export class MemoryStore implements Store {
  users = new Map<string, UserState>();
  sessions = new Map<string, Session>();
  async create(s: UserState) {
    this.users.set(s.id, structuredClone(s));
  }
  async get(id: string) {
    const s = this.users.get(id);
    return s ? currentState(structuredClone(s)) : undefined;
  }
  async ids() {
    return [...this.users.keys()];
  }
  async cas(s: UserState, r: number) {
    if (this.users.get(s.id)?.revision !== r) return false;
    this.users.set(s.id, structuredClone(s));
    return true;
  }
  async remove(id: string) {
    this.users.delete(id);
    for (const [h, s] of this.sessions)
      if (s.userId === id) this.sessions.delete(h);
  }
  async session(h: string) {
    return this.sessions.get(h);
  }
  async saveSession(s: Session) {
    this.sessions.set(s.hash, s);
  }
  async close() {}
}
// Single-process development persistence. Production always requires MongoDB.
export class FileStore extends MemoryStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private directory: string) {
    super();
  }
  async open() {
    await mkdir(this.directory, { recursive: true });
    try {
      const raw = JSON.parse(
        await readFile(join(this.directory, "state.json"), "utf8"),
      );
      this.users = new Map(raw.users);
      this.sessions = new Map(
        raw.sessions.map(([h, s]: [string, Session]) => [
          h,
          { ...s, expiresAt: new Date(s.expiresAt) },
        ]),
      );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
  private persist() {
    const data = JSON.stringify({
      users: [...this.users],
      sessions: [...this.sessions],
    });
    const next = this.queue.then(async () => {
      await writeFile(join(this.directory, "state.tmp"), data, { mode: 0o600 });
      await rename(
        join(this.directory, "state.tmp"),
        join(this.directory, "state.json"),
      );
    });
    this.queue = next.catch(() => {});
    return next;
  }
  override async create(s: UserState) {
    await super.create(s);
    await this.persist();
  }
  override async cas(s: UserState, r: number) {
    const ok = await super.cas(s, r);
    if (ok) await this.persist();
    return ok;
  }
  override async saveSession(s: Session) {
    await super.saveSession(s);
    await this.persist();
  }
  override async remove(id: string) {
    await super.remove(id);
    await this.persist();
  }
}
export class MongoStore implements Store {
  client: MongoClient;
  users: Collection<UserState>;
  sessions: Collection<Session>;
  constructor(uri: string, db: string) {
    this.client = new MongoClient(uri);
    this.users = this.client.db(db).collection("users");
    this.sessions = this.client.db(db).collection("sessions");
  }
  async open() {
    await this.client.connect();
    await this.users.createIndex({ id: 1 }, { unique: true });
    await this.sessions.createIndex({ hash: 1 }, { unique: true });
    await this.sessions.createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0 },
    );
  }
  async create(s: UserState) {
    await this.users.insertOne(s);
  }
  async get(id: string) {
    const s = await this.users.findOne({ id }, { projection: { _id: 0 } });
    return s ? currentState(s) : undefined;
  }
  async ids() {
    return (await this.users.find({}, { projection: { id: 1 } }).toArray()).map(
      (s) => s.id,
    );
  }
  async cas(s: UserState, r: number) {
    return (
      (await this.users.replaceOne({ id: s.id, revision: r }, s))
        .modifiedCount === 1
    );
  }
  async remove(id: string) {
    await this.users.deleteOne({ id });
    await this.sessions.deleteMany({ userId: id });
  }
  async session(hash: string) {
    return (
      (await this.sessions.findOne({ hash }, { projection: { _id: 0 } })) ??
      undefined
    );
  }
  async saveSession(s: Session) {
    await this.sessions.replaceOne({ hash: s.hash }, s, { upsert: true });
  }
  async close() {
    await this.client.close();
  }
}
