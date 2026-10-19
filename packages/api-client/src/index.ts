export type Category = "road_damage" | "garbage" | "waterlogging" | "manhole" | "open_drain" | "damaged_property" | "street_light" | "water_supply" | "other";
export type Status = "submitted" | "under_review" | "in_progress" | "resolved" | "rejected";
export interface User {
  id: string; name: string; email: string; role: string; jurisdiction_id: string;
  phone?: string; email_verified?: boolean;
}
export interface Auth {
  access_token: string; expires_at: string; token_type: string; user: User;
}
export interface Config {
  jurisdiction_id: string; jurisdiction_name: string;
  categories: {id: Category; label: string}[];
  analysis_state: "disabled"; notice: string;
}
export interface ComplaintInput {
  client_request_id: string; title: string; description: string; category: Category;
  latitude: number; longitude: number; location_text: string;
  location_source: "manual" | "device"; image_note?: string | null;
  area_name?: string | null;
}
export interface Complaint extends Omit<ComplaintInput, "client_request_id"> {
  id: string; tracking_id: string; jurisdiction_id: string; status: Status;
  version: number; received_at: string; updated_at: string; analysis_state: "disabled";
  area_name?: string | null;
}
export type PhotoRule = "required" | "recommended" | "optional";
export interface CategoryItem {
  id: string; code: string; label: string; description: string;
  target_hours: number; icon?: string; photo_rule?: PhotoRule; is_active?: boolean;
}
export interface Evidence {
  id: string; media_type: string; size_bytes: number; uploaded_at: string;
  phase?: "report" | "before" | "after"; taken_at?: string; signed_url?: string;
}
export interface Detail extends Complaint {
  events: {id: string; status: Status; note: string; created_at: string}[];
  evidence: Evidence[];
  assigned_worker_id?: string | null;
  assigned_worker_name?: string | null;
  assigned_team_name?: string | null;
}
export interface Page {items: Complaint[]; total: number; offset: number; limit: number}

export const labels: Record<Category, string> = {
  road_damage: "Potholes / visible road damage",
  garbage: "Garbage dumping / accumulation",
  waterlogging: "Road waterlogging",
  manhole: "Missing / broken manhole cover",
  open_drain: "Open drain or blockage",
  damaged_property: "Damaged public property",
  street_light: "Street light",
  water_supply: "Water supply",
  other: "Other civic issues",
};
export const transitions: Record<Status, Status[]> = {
  submitted: ["under_review"],
  under_review: ["in_progress", "resolved", "rejected"],
  in_progress: ["under_review", "resolved"],
  resolved: ["under_review"],
  rejected: ["under_review"],
};
export const statusLabel = (status: string) => status.replaceAll("_", " ");

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message); this.name = "ApiError"; this.status = status;
  }
}

export function humanizeValidationMessage(msg: string): string {
  if (!msg) return "Please check your input.";
  const clean = msg.trim();
  if (/string should have at least (\d+) characters/i.test(clean)) {
    const match = clean.match(/at least (\d+) characters/i);
    return `Please enter at least ${match ? match[1] : "more"} characters.`;
  }
  if (/field required/i.test(clean)) {
    return "This field is required.";
  }
  if (/value is not a valid email address/i.test(clean)) {
    return "Please enter a valid email address.";
  }
  if (/ensure this value has at most (\d+) characters/i.test(clean)) {
    const match = clean.match(/at most (\d+) characters/i);
    return `Please enter at most ${match ? match[1] : ""} characters.`;
  }
  return clean;
}

export function getErrorMessage(error: unknown, fallback?: string): string {
  if (!error) return fallback || "Something went wrong. Please try again.";
  if (typeof error === "string") return humanizeValidationMessage(error);

  if (Array.isArray(error)) {
    const messages = error
      .map((item) => {
        if (typeof item === "string") return humanizeValidationMessage(item);
        if (item && typeof item === "object") {
          const loc = Array.isArray(item.loc) ? item.loc.filter((l: unknown) => l !== "body").join(" ") : "";
          const msg = typeof item.msg === "string" ? humanizeValidationMessage(item.msg) : "Invalid input";
          return loc ? `${loc}: ${msg}` : msg;
        }
        return "Invalid input";
      })
      .filter(Boolean);

    return messages.length > 0 ? messages.join("; ") : "Please check the information you entered.";
  }

  const errObj = error as Record<string, unknown>;
  const detail = errObj.detail ?? errObj.message;

  if (typeof detail === "string") {
    return humanizeValidationMessage(detail);
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item === "string") return humanizeValidationMessage(item);
        if (item && typeof item === "object") {
          const loc = Array.isArray(item.loc) ? item.loc.filter((l: unknown) => l !== "body").join(" ") : "";
          const msg = typeof item.msg === "string" ? humanizeValidationMessage(item.msg) : "Invalid input";
          return loc ? `${loc}: ${msg}` : msg;
        }
        return "Invalid input";
      })
      .filter(Boolean);

    return messages.length > 0 ? messages.join("; ") : "Please check the information you entered.";
  }

  if (detail && typeof detail === "object") {
    const objDetail = detail as Record<string, unknown>;
    if (typeof objDetail.msg === "string") return humanizeValidationMessage(objDetail.msg);
    if (typeof objDetail.message === "string") return humanizeValidationMessage(objDetail.message);
  }

  if (typeof errObj.status === "number") {
    if (errObj.status === 401) return "Please sign in to continue.";
    if (errObj.status === 403) return "You do not have permission to perform this action.";
    if (errObj.status === 404) return "The requested record was not found.";
    if (errObj.status === 409) return "Another update was made at the same time. Please refresh and try again.";
    if (errObj.status === 429) return "Too many attempts. Please wait a few minutes and try again.";
    if (errObj.status >= 500) return "The server encountered an error. Please try again shortly.";
  }

  if (error instanceof Error && typeof error.message === "string") {
    return humanizeValidationMessage(error.message);
  }

  return "Something went wrong. Please try again.";
}

export function toList<T>(response: unknown): T[] {
  if (!response) return [];
  if (Array.isArray(response)) return response as T[];
  if (typeof response === "object") {
    const obj = response as Record<string, unknown>;
    if (Array.isArray(obj.items)) return obj.items as T[];
    if (Array.isArray(obj.results)) return obj.results as T[];
    if (Array.isArray(obj.data)) return obj.data as T[];
    if (Array.isArray(obj.logs)) return obj.logs as T[];
    if (Array.isArray(obj.reports)) return obj.reports as T[];
  }
  return [];
}

export function formatDate(dateStr?: string | Date | null): string {
  if (!dateStr) return "";
  const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(dateStr?: string | Date | null): string {
  if (!dateStr) return "";
  const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  if (isNaN(d.getTime())) return "";
  const datePart = d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const timePart = d.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).toLowerCase();
  return `${datePart}, ${timePart}`;
}

export function formatDuration(totalHours: number): string {
  if (totalHours <= 0) return "0 hours";
  const days = Math.floor(totalHours / 24);
  const hours = Math.round(totalHours % 24);
  if (days === 0) return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  if (hours === 0) return `${days} ${days === 1 ? "day" : "days"}`;
  return `${days} ${days === 1 ? "day" : "days"} ${hours} ${hours === 1 ? "hour" : "hours"}`;
}

export function formatPlural(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function createClient(baseUrl: string, token?: string) {
  const root = baseUrl.replace(/\/$/, "");
  async function timedFetch(url: string, options: RequestInit = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {return await fetch(url, {...options, signal: options.signal ?? controller.signal});}
    finally {clearTimeout(timer);}
  }
  async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
    let response: Response;
    try {
      response = await timedFetch(`${root}/api/v1${path}`, {
        ...options, headers,
      });
    } catch {
      throw new ApiError(0, "Cannot reach the server. Check your connection and retry.");
    }
    if (!response.ok) {
      let rawDetail: unknown;
      try {
        const body = await response.json();
        rawDetail = body.detail ?? body.message;
      } catch { /* No server details available. */ }
      const message = getErrorMessage(rawDetail || { status: response.status });
      throw new ApiError(response.status, message);
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }
  const json = (value: unknown) => JSON.stringify(value);
  return {
    config: () => request<Config>("/config"),
    register: (name: string, email: string, password: string) => request<User>("/auth/register", {
      method: "POST", body: json({name, email, password}),
    }),
    login: (email: string, password: string) => request<Auth>("/auth/login", {
      method: "POST", body: json({email, password}),
    }),
    me: () => request<User>("/auth/me"),
    logout: () => request<void>("/auth/logout", {method: "POST"}),
    list: (offset = 0, status?: Status) => request<Page>(
      `/complaints?offset=${offset}&limit=25${status ? `&status=${encodeURIComponent(status)}` : ""}`,
    ),
    get: (tracking: string) => request<Detail>(`/complaints/${encodeURIComponent(tracking)}`),
    submit: (data: ComplaintInput) => request<Detail>("/complaints", {method: "POST", body: json(data)}),
    update: (tracking: string, status: Status, note: string, version: number) => request<Detail>(
      `/complaints/${encodeURIComponent(tracking)}/status`, {
        method: "POST", body: json({status, note, expected_version: version}),
      },
    ),
    updateStatus: (
      tracking: string,
      statusOrInput: Status | { status: Status; note: string; expected_version: number },
      maybeNote?: string,
      maybeVersion?: number,
    ) => {
      const status = typeof statusOrInput === "object" ? statusOrInput.status : statusOrInput;
      const note = typeof statusOrInput === "object" ? statusOrInput.note : (maybeNote ?? "");
      const expected_version = typeof statusOrInput === "object" ? statusOrInput.expected_version : (maybeVersion ?? 1);
      return request<Detail>(
        `/complaints/${encodeURIComponent(tracking)}/status`, {
          method: "POST", body: json({status, note, expected_version}),
        },
      );
    },
    upload: (tracking: string, data: FormData) => request<Evidence>(
      `/complaints/${encodeURIComponent(tracking)}/evidence`, {method: "POST", body: data},
    ),
    async evidence(tracking: string, id: string): Promise<Blob> {
      const response = await timedFetch(`${root}/api/v1/complaints/${encodeURIComponent(tracking)}/evidence/${encodeURIComponent(id)}`, {
        headers: token ? {Authorization: `Bearer ${token}`} : {},
      });
      if (!response.ok) throw new ApiError(response.status, "Cannot load this photograph");
      return response.blob();
    },
    evidenceUrl: (tracking: string, id: string) => `${root}/api/v1/complaints/${encodeURIComponent(tracking)}/evidence/${encodeURIComponent(id)}`,
    signedEvidenceUrl: (tracking: string, id: string) => request<{ signed_url: string; expires_at: string }>(
      `/complaints/${encodeURIComponent(tracking)}/evidence/${encodeURIComponent(id)}/signed-url`,
    ),
  };
}
export type Client = ReturnType<typeof createClient>;

const HONORIFICS = new Set([
  "dr", "dr.", "mr", "mr.", "mrs", "mrs.", "ms", "ms.",
  "shri", "smt", "prof", "prof."
]);

/**
 * Drop honorifics (Dr, Mr, Mrs, Ms, Shri, Smt), skip initials such as "S.",
 * use the first real given name. "S. Ramanathan" -> "Ramanathan"; "Priya Patel" -> "Priya".
 * Falls back to the full name if nothing is left.
 */
export function displayName(fullName?: string | null): string {
  if (!fullName || !fullName.trim()) return "";
  const parts = fullName.trim().split(/\s+/);
  for (const part of parts) {
    const clean = part.toLowerCase();
    if (HONORIFICS.has(clean)) continue;
    if (/^[A-Za-z]\.?$/.test(part)) continue;
    if (part === part.toLowerCase()) {
      return part.charAt(0).toUpperCase() + part.slice(1);
    }
    return part;
  }
  const fallback = parts[0] || fullName.trim();
  if (fallback === fallback.toLowerCase()) {
    return fallback.charAt(0).toUpperCase() + fallback.slice(1);
  }
  return fallback;
}

/**
 * Time of day greeting using the viewer's local clock:
 * 5:00 to 11:59: "Good morning"
 * 12:00 to 16:59: "Good afternoon"
 * 17:00 to 23:59: "Good evening"
 * 0:00 to 4:59: "Hello"
 */
export function getTimeOfDayGreeting(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour <= 23) return "Good evening";
  return "Hello";
}
