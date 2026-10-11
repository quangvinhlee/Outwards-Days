import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryable = false,
  ) {
    super(message);
  }
}
export type Session = { token: string; expiresAt: string };
const sessionKey = "outsideweek.guest";
export async function session(): Promise<Session | undefined> {
  const raw = Platform.OS === "web"
    ? localStorage.getItem(sessionKey)
    : await SecureStore.getItemAsync(sessionKey);
  return raw ? JSON.parse(raw) as Session : undefined;
}
export async function saveSession(s: Session) {
  if (Platform.OS === "web") localStorage.setItem(sessionKey, JSON.stringify(s));
  else await SecureStore.setItemAsync(sessionKey, JSON.stringify(s));
}
export async function removeSession() {
  if (Platform.OS === "web") localStorage.removeItem(sessionKey);
  else await SecureStore.deleteItemAsync(sessionKey);
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
  timeoutMs = 15000,
): Promise<T> {
  const guest = await session();
  const base = Platform.OS === "web" && typeof window !== "undefined"
    ? process.env.EXPO_PUBLIC_WEB_API_BASE_URL || `${window.location.protocol}//${window.location.hostname}:3100`
    : process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:3100";
  let response: Response;
  try {
    response = await fetch(base + path, {
      method,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(guest ? { Authorization: `Bearer ${guest.token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new ApiError(
      0,
      "You’re offline, or the server is unavailable. Your saved plan is still here.",
      true,
    );
  }
  const data = await response.json();
  if (!response.ok)
    throw new ApiError(
      response.status,
      data.error?.message ?? "Please try again.",
      data.error?.retryable,
    );
  return data;
}
export async function startSession() {
  const s = await api<Session>("/v1/sessions/guest", "POST");
  await saveSession(s);
  return s;
}
