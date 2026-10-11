import { readFile } from "node:fs/promises";
import { MongoClient } from "mongodb";
let previous;
try {
  previous = JSON.parse(
    await readFile(new URL("../.data/state.json", import.meta.url), "utf8"),
  );
} catch (e) {
  if (e.code === "ENOENT") {
    console.log("No previous file-store data to migrate.");
    process.exit(0);
  }
  throw e;
}
if (!previous.users?.length) {
  console.log("No previous guest data to migrate.");
  process.exit(0);
}
const client = new MongoClient(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 10000,
});
try {
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || "outsideweek");
  let copied = 0;
  for (const [id, user] of previous.users) {
    const result = await db
      .collection("users")
      .updateOne({ id }, { $setOnInsert: user }, { upsert: true });
    copied += result.upsertedCount;
  }
  for (const [hash, session] of previous.sessions ?? [])
    await db.collection("sessions").updateOne(
      { hash },
      {
        $setOnInsert: { ...session, expiresAt: new Date(session.expiresAt) },
      },
      { upsert: true },
    );
  console.log(
    `Migrated ${copied} guest profile(s). Existing MongoDB records and the original file were preserved.`,
  );
} finally {
  await client.close();
}
