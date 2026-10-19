import type { Auth } from "@grievancegrid/api-client";

const AUTH_KEY = "gg_auth";

export function getStoredAuth(): Auth | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.access_token || !parsed.user) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveStoredAuth(auth: Auth): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(AUTH_KEY, JSON.stringify(auth));
}

export function clearStoredAuth(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(AUTH_KEY);
}

export function getRoleHomePath(role: string): string {
  switch (role) {
    case "citizen":
      return "/citizen";
    case "gro":
      return "/officer";
    case "field_officer":
      return "/field";
    case "supervisor":
      return "/senior";
    case "admin":
      return "/admin";
    default:
      return "/citizen";
  }
}
