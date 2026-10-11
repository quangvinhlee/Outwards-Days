import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { z } from "zod";

const scrypt = promisify(scryptCallback);
export const credentials = z.object({
  email: z.email({ error: "Enter a valid email address." }).max(254).transform((value) => value.trim().toLowerCase()),
  password: z.string().min(6, "Use at least 6 characters.").max(128),
}).strict();
export const loginCredentials = credentials.extend({ password: z.string().min(1).max(128) });

export async function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  const digest = await scrypt(password, salt, 64) as Buffer;
  return `scrypt:${salt}:${digest.toString("hex")}`;
}

export async function passwordMatches(password: string, stored: string) {
  const [algorithm, salt, digest] = stored.split(":");
  if (algorithm !== "scrypt" || !salt || !digest || !/^[a-f0-9]{128}$/.test(digest)) return false;
  const candidate = await scrypt(password, salt, 64) as Buffer;
  return timingSafeEqual(candidate, Buffer.from(digest, "hex"));
}
