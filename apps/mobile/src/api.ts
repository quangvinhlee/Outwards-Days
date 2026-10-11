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
export type Session = { token: string; expiresAt: string; userId?: string; email?: string };
const guestKey = "outsideweek.guest";
const accountKey = "outsideweek.account";
export async function session(): Promise<Session | undefined> {
  const raw = Platform.OS === "web"
    ? sessionStorage.getItem(accountKey) ?? localStorage.getItem(guestKey)
    : await SecureStore.getItemAsync(accountKey) ?? await SecureStore.getItemAsync(guestKey);
  return raw ? JSON.parse(raw) as Session : undefined;
}
export async function saveSession(s: Session, preserveGuest = false) {
  if (Platform.OS === "web") {
    if (s.email) {
      sessionStorage.setItem(accountKey, JSON.stringify(s));
      if (!preserveGuest) localStorage.removeItem(guestKey);
    } else localStorage.setItem(guestKey, JSON.stringify(s));
  } else if (s.email) {
    await SecureStore.setItemAsync(accountKey, JSON.stringify(s));
    if (!preserveGuest) await SecureStore.deleteItemAsync(guestKey);
  } else await SecureStore.setItemAsync(guestKey, JSON.stringify(s));
}
export async function removeAccountSession() {
  if (Platform.OS === "web") sessionStorage.removeItem(accountKey);
  else await SecureStore.deleteItemAsync(accountKey);
}
export async function removeSession() {
  if (Platform.OS === "web") {
    sessionStorage.removeItem(accountKey);
    localStorage.removeItem(guestKey);
  } else {
    await SecureStore.deleteItemAsync(accountKey);
    await SecureStore.deleteItemAsync(guestKey);
  }
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
