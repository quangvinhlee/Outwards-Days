import { it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  defaultPreferences,
  type UserState,
} from "../packages/contracts/src/index.js";
import { FileStore, MongoStore, mutate } from "../apps/api/src/store.js";
const user = (): UserState => ({
  id: randomUUID(),
  revision: 0,
  preferences: defaultPreferences(),
  schedules: {},
  plans: {},
  runs: [],
  completions: [],
});
it("restores development state and sessions after restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "outsideweek-test-"));
  try {
    const first = new FileStore(directory);
    await first.open();
    const state = user();
    await first.create(state);
    await first.saveSession({
      hash: "test-only",
      userId: state.id,
      expiresAt: new Date("2030-01-01"),
    });
    const second = new FileStore(directory);
    await second.open();
    expect(await second.get(state.id)).toEqual(state);
    expect((await second.session("test-only"))?.expiresAt).toBeInstanceOf(Date);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
it.skipIf(!process.env.TEST_MONGODB_URI)(
  "MongoDB compare-and-set serializes concurrent updates",
  async () => {
    const db = `outsideweek_test_${randomUUID().replaceAll("-", "")}`;
    const store = new MongoStore(process.env.TEST_MONGODB_URI!, db);
    try {
      await store.open();
      const state = user();
      await store.create(state);
      await Promise.all(
        Array.from({ length: 10 }, () =>
          mutate(store, state.id, (s) => {
            s.preferences.version++;
          }),
        ),
      );
      expect((await store.get(state.id))?.preferences.version).toBe(10);
      await store.saveSession({
        hash: "test-only",
        userId: state.id,
        expiresAt: new Date(Date.now() + 86400000),
      });
      expect((await store.session("test-only"))?.userId).toBe(state.id);
      await store.remove(state.id);
      expect(await store.session("test-only")).toBeUndefined();
    } finally {
      await store.client.db(db).dropDatabase();
      await store.close();
    }
  },
);
