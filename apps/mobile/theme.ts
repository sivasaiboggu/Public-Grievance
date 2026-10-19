export const colors = {
  bgPage: "#F6F5F2",
  bgSurface: "#FFFFFF",
  bgSubtle: "#ECEAE4",
  border: "#E3E1DB",
  borderFocus: "#1D4ED8",

  textInk: "#15171C",
  textMuted: "#5B5F66",
  textInverse: "#FFFFFF",

  primary: "#1D4ED8",
  primaryHover: "#1E40AF",
  primaryTint: "#E8EEFC",
  primaryText: "#173B9E",

  priorityCritical: "#B42318",
  priorityCriticalBg: "#FEE4E2",
  priorityHigh: "#C2540A",
  priorityHighBg: "#FEF0C7",
  priorityMedium: "#9A6700",
  priorityMediumBg: "#FEF7C3",
  priorityLow: "#2F6F4F",
  priorityLowBg: "#EAF5EE",

  success: "#1E7A4C",
  successBg: "#EAF5EE",
  error: "#B42318",
  errorBg: "#FEE4E2",
};

export const theme = {
  light: colors,
  dark: colors,
  colors,
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
  },
  radius: {
    sm: 6,
    md: 10,
    lg: 16,
    full: 9999,
  },
  typography: {
    xs: 12,
    sm: 14,
    body: 16,
    subtitle: 20,
    title: 24,
    heading: 32,
  },
  targets: {
    min: 44,
    primary: 48,
  },
};

export type ThemeColors = typeof colors;

export const PLAIN_STATUS_LABELS: Record<string, string> = {
  submitted: "Received",
  under_review: "Being reviewed",
  in_progress: "Work started",
  resolved: "Fixed",
  rejected: "Not accepted",
};

export const STATUS_DOT_COLORS: Record<string, string> = {
  submitted: "#C2540A",
  under_review: "#9A6700",
  in_progress: "#1D4ED8",
  resolved: "#1E7A4C",
  rejected: "#5B5F66",
};

export const PLAIN_ROLE_LABELS: Record<string, string> = {
  citizen: "Citizen",
  gro: "Officer",
  supervisor: "Senior authority",
  field_officer: "Field worker",
  admin: "Admin",
};

export function cleanAreaName(raw?: string): string {
  if (!raw) return "Service Area";
  return raw.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

export function formatFullDate(dateInput: string | Date): string {
  try {
    const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) return String(dateInput);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const day = d.getDate();
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, "0");
    const ampm = hours >= 12 ? "pm" : "am";
    hours = hours % 12 || 12;
    return `${day} ${month} ${year}, ${hours}:${minutes} ${ampm}`;
  } catch {
    return String(dateInput);
  }
}

export function formatRelativeTime(dateInput: string | Date): string {
  try {
    const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) return "";
    const diffMs = Date.now() - d.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMin > 0) return `${diffMin}m ago`;
    return "just now";
  } catch {
    return "";
  }
}

export const CONCURRENCY_CONFLICT_MESSAGE =
  "This report was just updated by someone else. Review the latest version, then save again.";
