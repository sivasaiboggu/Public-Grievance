import { format, formatDistanceToNow } from "date-fns";
import type { Category, Status } from "@grievancegrid/api-client";

export const PLAIN_STATUS_LABELS: Record<Status, string> = {
  submitted: "Received",
  under_review: "Being reviewed",
  in_progress: "Work started",
  resolved: "Fixed",
  rejected: "Not accepted",
};

export const STATUS_DOT_COLORS: Record<Status, string> = {
  submitted: "var(--priority-high, #C2540A)",
  under_review: "var(--priority-medium, #9A6700)",
  in_progress: "var(--primary, #1D4ED8)",
  resolved: "var(--success, #1E7A4C)",
  rejected: "var(--text-muted, #5B5F66)",
};

export const PLAIN_ROLE_LABELS: Record<string, string> = {
  citizen: "Citizen",
  gro: "Officer",
  supervisor: "Senior authority",
  field_officer: "Field worker",
  admin: "Admin",
};

export const ROLE_DESCRIPTIONS: { role: string; label: string; desc: string }[] = [
  {
    role: "citizen",
    label: "Citizen",
    desc: "Submits reports and tracks their progress.",
  },
  {
    role: "gro",
    label: "Officer",
    desc: "Reviews reports and updates their status.",
  },
  {
    role: "field_officer",
    label: "Field worker",
    desc: "Inspects reported issues and carries out repair work.",
  },
  {
    role: "supervisor",
    label: "Senior authority",
    desc: "Monitors overall response times and service standards.",
  },
  {
    role: "admin",
    label: "Admin",
    desc: "Manages system settings, areas, and report categories.",
  },
];

export { displayName, getTimeOfDayGreeting } from "@grievancegrid/api-client";

export const CATEGORY_METADATA: Record<Category, { label: string; desc: string; targetDays: number; tag?: string }> = {
  road_damage: {
    label: "Road damage",
    desc: "Potholes, cracks, broken edges.",
    targetDays: 5,
  },
  garbage: {
    label: "Garbage",
    desc: "Overflowing bins, dumping.",
    targetDays: 2,
  },
  waterlogging: {
    label: "Waterlogging",
    desc: "Water standing on the road.",
    targetDays: 1,
  },
  manhole: {
    label: "Missing or broken manhole cover",
    desc: "Open drains, loose or missing manhole covers.",
    targetDays: 1,
  },
  open_drain: {
    label: "Manhole or open drain",
    desc: "Missing or broken manhole covers, open drains.",
    targetDays: 1,
  },
  damaged_property: {
    label: "Damaged public property",
    desc: "Broken signs, benches, footpaths, bus stops.",
    targetDays: 3,
  },
  street_light: {
    label: "Street light",
    desc: "Lights that are off or flickering.",
    targetDays: 2,
  },
  water_supply: {
    label: "Water supply",
    desc: "No water, low pressure, leaks.",
    targetDays: 1,
  },
  other: {
    label: "Other",
    desc: "Anything else.",
    targetDays: 3,
  },
};

export interface CategorySLA {
  firstResponseHours: number;
  fixHours: number;
  fixDays: number;
  escalateAfterHours: number;
  charterLine: string;
}

export function getCategorySLA(cat?: string): CategorySLA {
  const normalized = (cat || "").toLowerCase();
  if (normalized.includes("manhole") || normalized.includes("drain")) {
    return {
      firstResponseHours: 2,
      fixHours: 24,
      fixDays: 1,
      escalateAfterHours: 12,
      charterLine: "We aim to look at it within 2 hours and fix it within 24 hours.",
    };
  }
  if (normalized.includes("waterlog") || normalized.includes("flood")) {
    return {
      firstResponseHours: 4,
      fixHours: 24,
      fixDays: 1,
      escalateAfterHours: 12,
      charterLine: "We aim to look at it within 4 hours and fix it within 24 hours.",
    };
  }
  if (normalized.includes("garbage") || normalized.includes("waste")) {
    return {
      firstResponseHours: 12,
      fixHours: 48,
      fixDays: 2,
      escalateAfterHours: 24,
      charterLine: "We aim to look at it within 12 hours and fix it within 48 hours.",
    };
  }
  // Default to road damage / standard:
  return {
    firstResponseHours: 24,
    fixHours: 120,
    fixDays: 5,
    escalateAfterHours: 48,
    charterLine: "We aim to look at it within 24 hours and fix it within 5 days.",
  };
}

export function getReportSLAInfo(receivedAt: string | Date, status: string, category?: string) {
  const sla = getCategorySLA(category);
  const rcv = typeof receivedAt === "string" ? new Date(receivedAt) : receivedAt;
  const now = new Date();
  const elapsedHours = (now.getTime() - rcv.getTime()) / (1000 * 3600);

  // If still in submitted status, check first response clock
  if (status === "submitted") {
    const diff = sla.firstResponseHours - elapsedHours;
    if (diff > 0) {
      const h = Math.ceil(diff);
      return {
        text: `First look due in ${h} ${h === 1 ? "hour" : "hours"}`,
        isOverdue: false,
        isWarning: true,
      };
    } else {
      const late = Math.max(1, Math.floor(Math.abs(diff)));
      return {
        text: `First look ${late} ${late === 1 ? "hour" : "hours"} late`,
        isOverdue: true,
        isWarning: true,
      };
    }
  }

  // If not resolved, check fix clock
  if (status !== "resolved" && status !== "rejected") {
    const diff = sla.fixHours - elapsedHours;
    if (diff > 0) {
      const days = Math.floor(diff / 24);
      const hours = Math.ceil(diff % 24);
      const text = days > 0 ? `Due in ${days}d ${hours}h` : `Due in ${hours}h`;
      return {
        text,
        isOverdue: false,
        isWarning: diff <= 12,
      };
    } else {
      const lateHours = Math.max(1, Math.floor(Math.abs(diff)));
      const lateDays = Math.floor(lateHours / 24);
      const text = lateDays > 0 ? `Overdue by ${lateDays}d` : `Overdue by ${lateHours}h`;
      return {
        text,
        isOverdue: true,
        isWarning: true,
      };
    }
  }

  return { text: "", isOverdue: false, isWarning: false };
}


/**
 * Removes trailing parentheticals such as "(simulated)" from the area name returned by the API.
 */
export function cleanAreaName(raw?: string): string {
  if (!raw) return "Service Area";
  return raw.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

/**
 * Returns a human-friendly title-cased display label for any category code.
 */
export function formatCategoryName(category?: string | null): string {
  if (!category) return "";
  const cat = category.toLowerCase().trim() as Category;
  if (CATEGORY_METADATA[cat]?.label) {
    return CATEGORY_METADATA[cat].label;
  }
  return cat
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Formats a date into plain human style: "18 Oct 2026, 1:08 am"
 */
/**
 * Formats a date into plain human style: "20 Jul 2026, 12:46 pm"
 */
export function formatDateTime(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return "";
  try {
    const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) return String(dateInput);
    const raw = new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(d);
    return raw.replace(/\bSept\b/g, "Sep").replace(/\bAM\b/g, "am").replace(/\bPM\b/g, "pm");
  } catch {
    return String(dateInput);
  }
}

export const formatFullDate = formatDateTime;

/**
 * Formats a date into plain human date style: "20 Sep 2026" or "1 Oct"
 */
export function formatDate(dateInput: string | Date | null | undefined, includeYear = true): string {
  if (!dateInput) return "";
  try {
    const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) return String(dateInput);
    const options: Intl.DateTimeFormatOptions = {
      day: "numeric",
      month: "short",
    };
    if (includeYear) {
      options.year = "numeric";
    }
    const raw = new Intl.DateTimeFormat("en-GB", options).format(d);
    return raw.replace(/\bSept\b/g, "Sep");
  } catch {
    return String(dateInput);
  }
}

/**
 * Relative time helper: "3 hours ago", "in 2 days"
 */
export function formatRelativeTime(dateInput: string | Date | number): string {
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return String(dateInput);
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return String(dateInput);
  }
}

/**
 * Human duration helper: "2 days 5 hours", "3 hours", "45 minutes"
 */
export function formatDuration(hours: number | null | undefined): string {
  if (hours == null || isNaN(hours) || hours <= 0) return "Less than an hour";
  const totalMinutes = Math.round(hours * 60);
  const d = Math.floor(totalMinutes / (24 * 60));
  const h = Math.floor((totalMinutes % (24 * 60)) / 60);
  const m = totalMinutes % 60;

  if (d > 0) {
    if (h > 0) return `${d} day${d > 1 ? "s" : ""} ${h} hour${h > 1 ? "s" : ""}`;
    return `${d} day${d > 1 ? "s" : ""}`;
  }
  if (h > 0) {
    if (m > 0 && h < 4) return `${h} hour${h > 1 ? "s" : ""} ${m} min`;
    return `${h} hour${h > 1 ? "s" : ""}`;
  }
  return `${Math.max(1, m)} minutes`;
}

/**
 * Plural helper: formatPlural(5, "report") -> "5 reports"
 */
export function formatPlural(count: number, singular: string, plural?: string): string {
  const p = plural || `${singular}s`;
  return `${count} ${count === 1 ? singular : p}`;
}

export const CONCURRENCY_CONFLICT_MESSAGE =
  "This report was just updated by someone else. Review the latest version, then save again.";
