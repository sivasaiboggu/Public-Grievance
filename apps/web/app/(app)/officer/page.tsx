"use client";

import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  Search,
  MapPin,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Filter,
  X,
  Copy,
  Check,
  Loader2,
  Calendar,
  Clock,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import {
  transitions,
  type Complaint,
  type Detail,
  type Status,
  getTimeOfDayGreeting,
  displayName,
} from "@grievancegrid/api-client";
import { PhotoGallery } from "../../../components/PhotoGallery";
import { StatusChip } from "../../../components/StatusChip";
import { ReportRow, type ReportRowData } from "../../../components/ReportRow";
import { PageContainer } from "../../../components/Layout";
import { OfficerActionControls } from "../../../components/OfficerActionControls";
import { getApiClient, showToastError } from "../../../lib/api";
import { getStoredAuth } from "../../../lib/auth";
import {
  PLAIN_STATUS_LABELS,
  CATEGORY_METADATA,
  formatCategoryName,
  formatDateTime,
  formatPlural,
  getReportSLAInfo,
  CONCURRENCY_CONFLICT_MESSAGE,
} from "../../../lib/labels";

const ALL_STATUSES: Status[] = [
  "submitted",
  "under_review",
  "in_progress",
  "resolved",
  "rejected",
];

const DISALLOWED_REASONS: Record<string, string> = {
  "submitted->resolved": "Start work first",
  "submitted->in_progress": "Review it first",
  "under_review->resolved": "Start work first",
  "in_progress->submitted": "Not possible from here",
  "resolved->submitted": "Not possible from here",
  "resolved->under_review": "Not possible from here",
  "rejected->submitted": "Not possible from here",
  "rejected->in_progress": "Not possible from here",
  "rejected->resolved": "Not possible from here",
};

interface FieldWorker {
  id: string;
  name: string;
  email: string;
  team_id: string | null;
  team_name: string | null;
  active_tasks_count?: number;
}

interface SuggestionData {
  disclaimer: string;
  primary_suggestion?: string | null;
  relevance_hint?: string | null;
  same_photo_hint?: string | null;
  priority_info?: {
    priority: string;
    target_hours: number;
    why_this_order: string[];
    is_overdue?: boolean;
    days_overdue?: number;
  };
  predictions?: Array<{
    id: string;
    kind: string;
    model_name: string;
    display?: string;
    decision?: string;
    feedback?: string;
  }>;
  authenticity_info?: {
    level: string;
    reasons: string[];
    disclaimer: string;
  } | null;
  confirmed_duplicate_count?: number;
  enabled?: boolean;
}

interface ClusterMember {
  complaint_id: string;
  tracking_id: string;
  title: string;
  category: string;
  status: string;
  distance_meters: number;
  days_apart: number;
  added_by: string;
}

interface ClusterData {
  cluster_id: string;
  category: string;
  state: string;
  is_clustered: boolean;
  total_members: number;
  members: ClusterMember[];
  is_recurrence: boolean;
  resident_line: string;
}

interface DuplicateCandidate {
  id: string;
  tracking_id: string;
  title: string;
  category: string;
  status: string;
  location_text: string;
  distance_meters: number;
  days_apart: number;
  score: number;
  match_reasons: string[];
  thumbnail_url?: string | null;
  existing_decision?: string | null;
  link_id?: string | null;
}

export default function OfficerWorkspacePage() {
  const auth = getStoredAuth();
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [selected, setSelected] = useState<Detail | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Suggestions, Clusters & Duplicates
  const [suggestions, setSuggestions] = useState<SuggestionData | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([]);
  const [cluster, setCluster] = useState<ClusterData | null>(null);
  const [submittingClusterDecision, setSubmittingClusterDecision] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [submittingFeedback, setSubmittingFeedback] = useState<string | null>(null);
  const [submittingDuplicate, setSubmittingDuplicate] = useState<string | null>(null);
  const [propagateUpdate, setPropagateUpdate] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState<Status | "">("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [teamFilter, setTeamFilter] = useState<string>("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);

  // Pane layout state
  const [listWidth, setListWidth] = useState<number>(380);
  const [isListCollapsed, setIsListCollapsed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  // Action form states
  const [officerNote, setOfficerNote] = useState("");
  const [nextStatus, setNextStatus] = useState<Status>("under_review");
  const [submitting, setSubmitting] = useState(false);

  // Assignment states
  const [fieldWorkers, setFieldWorkers] = useState<FieldWorker[]>([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [workerSearch, setWorkerSearch] = useState("");
  const [workerComboboxOpen, setWorkerComboboxOpen] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Restore saved pane width from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("gg-officer-pane-width");
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (parsed >= 340 && parsed <= 480) {
          setListWidth(parsed);
        }
      }
    } catch {
      // Ignored
    }
  }, []);

  // Close filter popover on outside click
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setFilterPopoverOpen(false);
      }
    };
    if (filterPopoverOpen) {
      document.addEventListener("mousedown", handleOutside);
      return () => document.removeEventListener("mousedown", handleOutside);
    }
  }, [filterPopoverOpen]);

  // Global keyboard shortcuts: "/" focuses search
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== searchInputRef.current) {
        const tag = (document.activeElement?.tagName || "").toLowerCase();
        if (tag !== "input" && tag !== "textarea" && tag !== "select") {
          e.preventDefault();
          searchInputRef.current?.focus();
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const loadFieldWorkers = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/field-workers", {
        headers: { Authorization: `Bearer ${auth?.access_token}` },
      });
      if (res.ok) {
        setFieldWorkers(await res.json());
      }
    } catch {
      // Ignored
    }
  }, [auth]);

  useEffect(() => {
    loadFieldWorkers();
  }, [loadFieldWorkers]);

  const fetchSuggestions = useCallback(async (tracking: string) => {
    try {
      setLoadingSuggestions(true);
      const [sugRes, dupRes, clRes] = await Promise.all([
        fetch(`/api/v1/reports/${encodeURIComponent(tracking)}/suggestions`, {
          headers: { Authorization: `Bearer ${auth?.access_token}` },
        }),
        fetch(`/api/v1/reports/${encodeURIComponent(tracking)}/duplicates`, {
          headers: { Authorization: `Bearer ${auth?.access_token}` },
        }),
        fetch(`/api/v1/complaints/${encodeURIComponent(tracking)}/cluster`, {
          headers: { Authorization: `Bearer ${auth?.access_token}` },
        }),
      ]);
      if (sugRes.ok) {
        setSuggestions(await sugRes.json());
      } else {
        setSuggestions(null);
      }
      if (dupRes.ok) {
        setDuplicates(await dupRes.json());
      } else {
        setDuplicates([]);
      }
      if (clRes.ok) {
        setCluster(await clRes.json());
      } else {
        setCluster(null);
      }
    } catch {
      setSuggestions(null);
      setDuplicates([]);
      setCluster(null);
    } finally {
      setLoadingSuggestions(false);
    }
  }, [auth]);

  const handleClusterDecision = async (decision: "same_problem" | "different_problem" | "came_back") => {
    if (!selected) return;
    try {
      setSubmittingClusterDecision(true);
      const res = await fetch(`/api/v1/complaints/${encodeURIComponent(selected.tracking_id)}/cluster/decision`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${auth?.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ decision }),
      });
      if (res.ok) {
        toast.success(`Recorded as "${decision.replace('_', ' ')}".`);
        fetchSuggestions(selected.tracking_id);
      } else {
        showToastError(null, "Could not save cluster decision.");
      }
    } catch (err) {
      showToastError(err, "Failed to save cluster decision.");
    } finally {
      setSubmittingClusterDecision(false);
    }
  };

  const selectComplaint = async (trackingId: string) => {
    setLoadingDetail(true);
    try {
      const client = getApiClient();
      const detail = await client.get(trackingId);
      setSelected(detail);
      setOfficerNote("");
      setSelectedWorkerId("");
      setWorkerComboboxOpen(false);

      // Default status select to the report's current status
      setNextStatus(detail.status);
      setMobileView("detail");

      // Fetch software suggestions and duplicates
      fetchSuggestions(trackingId);
    } catch (err) {
      showToastError(err, `Could not load details for ${trackingId}.`);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleFeedback = async (predictionId: string, choice: "right" | "wrong") => {
    try {
      setSubmittingFeedback(predictionId);
      const res = await fetch(`/api/v1/suggestions/${predictionId}/feedback`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${auth?.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ feedback_choice: choice }),
      });
      if (res.ok) {
        toast.success(choice === "right" ? "Marked as looks right." : "Marked as not right.");
        setSuggestions((prev) => {
          if (!prev || !prev.predictions) return prev;
          return {
            ...prev,
            predictions: prev.predictions.map((p) =>
              p.id === predictionId ? { ...p, feedback: choice } : p
            ),
          };
        });
      }
    } catch (err) {
      showToastError(err, "Could not save feedback.");
    } finally {
      setSubmittingFeedback(null);
    }
  };

  const handleDuplicateDecision = async (
    otherTracking: string,
    decision: "same_problem" | "different_problem"
  ) => {
    if (!selected) return;
    try {
      setSubmittingDuplicate(otherTracking);
      const res = await fetch(
        `/api/v1/reports/${selected.tracking_id}/duplicates/${otherTracking}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${auth?.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            decision,
            propagate_to_linked: propagateUpdate,
          }),
        }
      );
      if (res.ok) {
        toast.success(
          decision === "same_problem"
            ? `Linked as same problem.`
            : `Marked as different problem.`
        );
        fetchSuggestions(selected.tracking_id);
      } else {
        const err = await res.json();
        showToastError(err, "Could not save duplicate decision.");
      }
    } catch (err) {
      showToastError(err, "Could not save duplicate decision.");
    } finally {
      setSubmittingDuplicate(null);
    }
  };

  const loadQueue = useCallback(async () => {
    setLoadingList(true);
    try {
      const client = getApiClient();
      const res = await client.list(0);
      setComplaints(res.items);

      if (
        !selected &&
        res.items.length > 0 &&
        typeof window !== "undefined" &&
        window.innerWidth >= 1024
      ) {
        selectComplaint(res.items[0].tracking_id);
      }
    } catch (err) {
      showToastError(err, "Could not load reports.");
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  // Drag handle logic
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const clamped = Math.max(340, Math.min(480, e.clientX - 24));
      setListWidth(clamped);
      try {
        localStorage.setItem("gg-officer-pane-width", String(clamped));
      } catch {
        // Ignored
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    toast.success(`Copied ${code}`);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleAssignWorker = async (workerId: string) => {
    if (!selected || !workerId) return;

    setAssigning(true);
    try {
      const res = await fetch(`/api/v1/complaints/${selected.tracking_id}/assign`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${auth?.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          field_worker_id: workerId,
        }),
      });

      if (res.ok) {
        toast.success("Task assigned. The worker has been notified.");
        await selectComplaint(selected.tracking_id);
        loadFieldWorkers();
        loadQueue();
      } else {
        const err = await res.json();
        showToastError(err, "Could not assign task.");
      }
    } catch (err) {
      showToastError(err, "Could not assign task.");
    } finally {
      setAssigning(false);
    }
  };

  const handleSaveUpdate = async (newStatus: Status, note: string) => {
    if (!selected) return;

    if (newStatus === selected.status && !note.trim()) {
      return;
    }

    if (note.trim() && note.trim().length < 5) {
      toast.error("Please write a note of at least 5 characters.");
      return;
    }

    setSubmitting(true);
    try {
      const client = getApiClient();
      const updated = await client.updateStatus(selected.tracking_id, {
        status: newStatus,
        note: note.trim() || `Status updated to ${PLAIN_STATUS_LABELS[newStatus] || newStatus}`,
        expected_version: selected.version,
      });

      setSelected(updated);
      toast.success("Saved. The resident can see it.");
      setMobileSheetOpen(false);

      setComplaints((prev) =>
        prev.map((c) =>
          c.tracking_id === updated.tracking_id
            ? { ...c, status: updated.status, version: updated.version, updated_at: updated.updated_at }
            : c
        )
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("version") || msg.includes("conflict")) {
        toast.error(CONCURRENCY_CONFLICT_MESSAGE);
        selectComplaint(selected.tracking_id);
      } else {
        showToastError(err, "Failed to update status.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const getDeadlineInfo = (item: { category: string; received_at: string; status: string }) => {
    return getReportSLAInfo(item.received_at, item.status, item.category);
  };

  // Status counts for filters
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    ALL_STATUSES.forEach((s) => (counts[s] = 0));
    complaints.forEach((c) => {
      if (counts[c.status] !== undefined) counts[c.status]++;
    });
    return counts;
  }, [complaints]);

  // Filter complaints
  const filteredComplaints = useMemo(() => {
    return complaints.filter((c) => {
      if (statusFilter && c.status !== statusFilter) return false;
      if (categoryFilter && c.category !== categoryFilter) return false;
      if (overdueOnly) {
        const dl = getDeadlineInfo(c);
        if (!dl.isOverdue) return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const match =
          c.title.toLowerCase().includes(q) ||
          c.tracking_id.toLowerCase().includes(q) ||
          c.location_text.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [complaints, statusFilter, categoryFilter, overdueOnly, search]);

  // Keyboard navigation up / down & Enter
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || "").toLowerCase();
      if (activeTag === "input" || activeTag === "textarea" || activeTag === "select") {
        return;
      }

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const currentIndex = filteredComplaints.findIndex(
          (c) => c.tracking_id === selected?.tracking_id
        );
        if (currentIndex === -1) {
          if (filteredComplaints.length > 0) {
            selectComplaint(filteredComplaints[0].tracking_id);
          }
          return;
        }

        const nextIndex =
          e.key === "ArrowDown"
            ? Math.min(filteredComplaints.length - 1, currentIndex + 1)
            : Math.max(0, currentIndex - 1);

        if (nextIndex !== currentIndex) {
          selectComplaint(filteredComplaints[nextIndex].tracking_id);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filteredComplaints, selected]);

  const allowedTransitions = selected ? transitions[selected.status] || [] : [];

  // Active filter count
  const activeFiltersCount =
    (statusFilter ? 1 : 0) + (categoryFilter ? 1 : 0) + (overdueOnly ? 1 : 0);

  return (
    <div style={{ height: "calc(100dvh - var(--header-height, 56px))", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Top Title Bar - Identical page container margin */}
      <div style={{ width: "100%", maxWidth: "var(--shell-max, 1280px)", margin: "0 auto", padding: "16px 24px 12px", boxSizing: "border-box", flexShrink: 0 }}>
        {(() => {
          const officerName = displayName(auth?.user?.name);
          const greeting = officerName ? `${getTimeOfDayGreeting()}, ${officerName}` : getTimeOfDayGreeting();
          const waitingCount = complaints.filter(
            (c) => c.status === "submitted" || c.status === "under_review"
          ).length;
          const liveSentence =
            waitingCount === 0
              ? "You have no reports waiting for review right now."
              : `You have ${waitingCount} report${waitingCount === 1 ? "" : "s"} waiting for review today.`;

          return (
            <div>
              <h1
                style={{
                  fontSize: "1.5rem",
                  fontWeight: 700,
                  color: "var(--text-ink)",
                  margin: 0,
                  letterSpacing: "-0.01em",
                  textAlign: "left",
                }}
              >
                {greeting}
              </h1>
              <p style={{ margin: "4px 0 0", fontSize: "14px", color: "var(--text-muted)" }}>
                {liveSentence}
              </p>
            </div>
          );
        })()}
      </div>

      {/* Main Two-Pane Viewport Container */}
      <div
        className="officer-viewport-container"
        style={{
          width: "100%",
          maxWidth: "var(--shell-max, 1280px)",
          margin: "0 auto",
          padding: "0 24px 16px",
          boxSizing: "border-box",
          flex: 1,
          minHeight: 0,
          display: "flex",
          gap: 0,
        }}
      >
        {/* Left List Pane */}
        <div
          style={{
            width: isListCollapsed ? "44px" : `clamp(340px, ${listWidth}px, 480px)`,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md) 0 0 var(--radius-md)",
            borderRight: "none",
            backgroundColor: "var(--bg-surface)",
            overflow: "hidden",
            transition: isDragging ? "none" : "width 150ms ease",
          }}
          className={`officer-list-pane ${mobileView === "detail" ? "mobile-hidden-pane" : ""}`}
        >
          {isListCollapsed ? (
            <div style={{ padding: "12px 6px", textAlign: "center" }}>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setIsListCollapsed(false)}
                title="Expand list"
                aria-label="Expand list"
                style={{ padding: "6px" }}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          ) : (
            <>
              {/* Search & Filters Bar */}
              <div
                style={{
                  padding: "12px 14px 10px",
                  borderBottom: "1px solid var(--border-subtle)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <div style={{ position: "relative", flex: 1 }}>
                    <Search
                      size={15}
                      style={{
                        position: "absolute",
                        left: 10,
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: "var(--text-muted)",
                      }}
                    />
                    <input
                      ref={searchInputRef}
                      type="search"
                      placeholder="Search reports"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "7px 10px 7px 32px",
                        fontSize: "13px",
                        boxSizing: "border-box",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border)",
                      }}
                    />
                  </div>

                  {/* Filters Popover Trigger */}
                  <div style={{ position: "relative" }} ref={popoverRef}>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setFilterPopoverOpen(!filterPopoverOpen)}
                      style={{
                        padding: "7px 10px",
                        fontSize: "12px",
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                        backgroundColor: activeFiltersCount > 0 ? "var(--primary-subtle)" : undefined,
                        borderColor: activeFiltersCount > 0 ? "var(--primary)" : undefined,
                      }}
                    >
                      <Filter size={14} />
                      <span>Filters</span>
                      {activeFiltersCount > 0 && (
                        <span
                          style={{
                            background: "var(--primary)",
                            color: "#fff",
                            borderRadius: "10px",
                            padding: "0 6px",
                            fontSize: "10px",
                            fontWeight: 600,
                          }}
                        >
                          {activeFiltersCount}
                        </span>
                      )}
                    </button>

                    {/* Popover Card */}
                    {filterPopoverOpen && (
                      <div
                        style={{
                          position: "absolute",
                          top: "calc(100% + 6px)",
                          right: 0,
                          width: "280px",
                          backgroundColor: "var(--bg-surface)",
                          border: "1px solid var(--border)",
                          borderRadius: "var(--radius-md)",
                          boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                          padding: "14px",
                          zIndex: 40,
                          display: "flex",
                          flexDirection: "column",
                          gap: "12px",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: "13px", fontWeight: 600 }}>Filter reports</span>
                          <button
                            type="button"
                            className="btn-ghost"
                            onClick={() => {
                              setStatusFilter("");
                              setCategoryFilter("");
                              setOverdueOnly(false);
                            }}
                            style={{ fontSize: "11px", padding: "2px 4px", color: "var(--text-muted)" }}
                          >
                            Clear all
                          </button>
                        </div>

                        {/* Status Filter */}
                        <div>
                          <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
                            Status
                          </label>
                          <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value as Status | "")}
                            style={{ width: "100%", padding: "5px 8px", fontSize: "12px" }}
                          >
                            <option value="">All statuses ({complaints.length})</option>
                            {ALL_STATUSES.map((st) => (
                              <option key={st} value={st}>
                                {PLAIN_STATUS_LABELS[st]} ({statusCounts[st] || 0})
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Category Filter */}
                        <div>
                          <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
                            Category
                          </label>
                          <select
                            value={categoryFilter}
                            onChange={(e) => setCategoryFilter(e.target.value)}
                            style={{ width: "100%", padding: "5px 8px", fontSize: "12px" }}
                          >
                            <option value="">All categories</option>
                            <option value="road_damage">Road damage</option>
                            <option value="garbage">Garbage</option>
                            <option value="waterlogging">Waterlogging</option>
                            <option value="open_drain">Manhole or open drain</option>
                            <option value="damaged_property">Damaged public property</option>
                            <option value="street_light">Street light</option>
                            <option value="water_supply">Water supply</option>
                            <option value="other">Other</option>
                          </select>
                        </div>

                        {/* Overdue Checkbox */}
                        <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13px" }}>
                          <input
                            type="checkbox"
                            checked={overdueOnly}
                            onChange={(e) => setOverdueOnly(e.target.checked)}
                          />
                          <span>Overdue only</span>
                        </label>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setIsListCollapsed(true)}
                    title="Collapse list"
                    aria-label="Collapse list"
                    style={{ padding: "6px", color: "var(--text-muted)" }}
                  >
                    <ChevronLeft size={16} />
                  </button>
                </div>

                {/* Filter chips */}
                {activeFiltersCount > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {statusFilter && (
                      <span
                        style={{
                          fontSize: "11px",
                          backgroundColor: "var(--bg-subtle)",
                          padding: "2px 8px",
                          borderRadius: "12px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        {PLAIN_STATUS_LABELS[statusFilter]}
                        <X size={11} style={{ cursor: "pointer" }} onClick={() => setStatusFilter("")} />
                      </span>
                    )}
                    {categoryFilter && (
                      <span
                        style={{
                          fontSize: "11px",
                          backgroundColor: "var(--bg-subtle)",
                          padding: "2px 8px",
                          borderRadius: "12px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        {categoryFilter.replace("_", " ")}
                        <X size={11} style={{ cursor: "pointer" }} onClick={() => setCategoryFilter("")} />
                      </span>
                    )}
                    {overdueOnly && (
                      <span
                        style={{
                          fontSize: "11px",
                          backgroundColor: "var(--priority-high-bg, #FEF0C7)",
                          color: "var(--priority-high, #C2540A)",
                          padding: "2px 8px",
                          borderRadius: "12px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          fontWeight: 500,
                        }}
                      >
                        Overdue only
                        <X size={11} style={{ cursor: "pointer" }} onClick={() => setOverdueOnly(false)} />
                      </span>
                    )}
                  </div>
                )}

                {/* Count Line */}
                <div style={{ fontSize: "12px", color: "var(--text-muted)", textAlign: "left" }}>
                  {formatPlural(filteredComplaints.length, "report")}
                </div>
              </div>

              {/* List Body with Hairline Dividers */}
              <div
                role="listbox"
                aria-label="Reports list"
                style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}
              >
                {loadingList ? (
                  <div style={{ padding: "12px" }}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <div
                        key={n}
                        className="skeleton"
                        style={{ height: "64px", marginBottom: "8px", borderRadius: "var(--radius-sm)" }}
                      />
                    ))}
                  </div>
                ) : filteredComplaints.length === 0 ? (
                  <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
                    No reports match. Clear filters.
                  </div>
                ) : (
                  filteredComplaints.map((item) => {
                    const dl = getDeadlineInfo(item);
                    const rowData: ReportRowData = {
                      id: item.id,
                      tracking_id: item.tracking_id,
                      title: item.title,
                      status: item.status,
                      category: item.category,
                      location_text: item.location_text,
                      area_name: (item as any).area_name,
                      received_at: item.received_at,
                      isOverdue: dl.isOverdue,
                      dueText: dl.text,
                      clusterCount: (item as any).cluster_count,
                    };
                    return (
                      <ReportRow
                        key={item.id}
                        report={rowData}
                        isSelected={selected?.tracking_id === item.tracking_id}
                        onSelect={() => selectComplaint(item.tracking_id)}
                      />
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>

        {/* Draggable Divider */}
        {!isListCollapsed && (
          <div
            onMouseDown={handleMouseDown}
            style={{
              width: "4px",
              cursor: "col-resize",
              backgroundColor: isDragging ? "var(--primary)" : "var(--border)",
              transition: "background-color 150ms ease",
              flexShrink: 0,
            }}
            title="Drag to resize panel"
          />
        )}

        {/* Right Detail Pane */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            border: "1px solid var(--border)",
            borderLeft: isListCollapsed ? "1px solid var(--border)" : "none",
            borderRadius: "0 var(--radius-md) var(--radius-md) 0",
            backgroundColor: "var(--bg-surface)",
            overflow: "hidden",
          }}
          className={`officer-detail-pane ${mobileView === "list" ? "mobile-hidden-pane" : ""}`}
        >
          {loadingDetail ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Loader2 size={24} className="spin" color="var(--primary)" />
            </div>
          ) : !selected ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
              Select a report from the list to view its details.
            </div>
          ) : (
            <>
              {/* Main detail content area (scrolls independently) */}
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflowY: "auto",
                  padding: "24px",
                  boxSizing: "border-box",
                  display: "flex",
                  flexDirection: "column",
                  gap: "20px",
                }}
              >
                {/* Mobile Back Button */}
                <div style={{ display: "none" }} className="mobile-only-back">
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setMobileView("list")}
                    style={{ padding: "6px 0", fontSize: "13px", display: "inline-flex", alignItems: "center", gap: "4px" }}
                  >
                    <ChevronLeft size={16} />
                    <span>Back to reports</span>
                  </button>
                </div>

                {/* 1. Header block */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                      <span
                        style={{
                          fontFamily: "var(--font-mono, monospace)",
                          fontSize: "14px",
                          fontWeight: 600,
                          color: "var(--text-muted)",
                        }}
                      >
                        {selected.tracking_id}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyCode(selected.tracking_id)}
                        title="Copy reference code"
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: "2px",
                          color: copiedCode ? "var(--success)" : "var(--text-muted)",
                        }}
                      >
                        {copiedCode ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                    </div>
                    <StatusChip status={selected.status} />
                  </div>

                  <h2
                    style={{
                      fontSize: "1.25rem",
                      fontWeight: 600,
                      color: "var(--text-ink)",
                      margin: "0 0 8px",
                      lineHeight: 1.35,
                      wordBreak: "break-word",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {selected.title}
                  </h2>

                  <div style={{ fontSize: "12px", color: "var(--text-muted)", display: "flex", flexWrap: "wrap", gap: "4px 8px", alignItems: "center" }}>
                    <span>{formatCategoryName(selected.category)}</span>
                    <span>· {(selected as any).area_name || selected.location_text}</span>
                    <span>· Received {formatDateTime(selected.received_at)}</span>
                    {getDeadlineInfo(selected).text && (
                      <span
                        style={{
                          fontWeight: getDeadlineInfo(selected).isOverdue ? 600 : 400,
                          color: getDeadlineInfo(selected).isOverdue ? "var(--priority-high)" : "var(--text-muted)",
                        }}
                      >
                        · {getDeadlineInfo(selected).text}
                      </span>
                    )}
                  </div>
                </div>

                {/* 2. Compact Progress Strip */}
                <div
                  style={{
                    backgroundColor: "var(--bg-subtle)",
                    borderRadius: "var(--radius-sm)",
                    padding: "12px 16px",
                  }}
                >
                  {selected.status === "rejected" ? (
                    <div style={{ color: "var(--text-muted)", fontSize: "13px", fontWeight: 500 }}>
                      Report not accepted
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(4, 1fr)",
                        gap: "8px",
                        alignItems: "center",
                      }}
                    >
                      {[
                        { key: "submitted", label: "Received", step: 1 },
                        { key: "under_review", label: "Being reviewed", step: 2 },
                        { key: "in_progress", label: "Work started", step: 3 },
                        { key: "resolved", label: "Fixed", step: 4 },
                      ].map((step, idx) => {
                        const currentStepIndex =
                          selected.status === "submitted"
                            ? 1
                            : selected.status === "under_review"
                            ? 2
                            : selected.status === "in_progress"
                            ? 3
                            : selected.status === "resolved"
                            ? 4
                            : 0;

                        const isFilled = step.step <= currentStepIndex;

                        return (
                          <div key={step.key} style={{ textAlign: "center" }}>
                            <div
                              style={{
                                height: "4px",
                                borderRadius: "2px",
                                backgroundColor: isFilled ? "var(--primary)" : "var(--border)",
                                marginBottom: "6px",
                              }}
                            />
                            <span
                              style={{
                                fontSize: "11px",
                                fontWeight: step.step === currentStepIndex ? 600 : 400,
                                color: isFilled ? "var(--text-ink)" : "var(--text-muted)",
                              }}
                            >
                              {step.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Action Section on smaller screens (< 1360px) directly below progress strip */}
                <div className="inline-action-section" style={{ display: "none" }}>
                  <div
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      padding: "16px",
                      backgroundColor: "var(--bg-surface)",
                    }}
                  >
                    <OfficerActionControls
                      selected={selected}
                      fieldWorkers={fieldWorkers}
                      onAssign={handleAssignWorker}
                      onSaveUpdate={handleSaveUpdate}
                      isSubmitting={submitting}
                      isAssigning={assigning}
                      idPrefix="inline"
                    />
                  </div>
                </div>

                {/* 3. What the resident wrote */}
                <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "18px" }}>
                  <h3 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-muted)", margin: "0 0 8px" }}>
                    What the resident wrote
                  </h3>
                  <p
                    style={{
                      fontSize: "14px",
                      lineHeight: 1.6,
                      color: "var(--text-ink)",
                      margin: 0,
                      wordBreak: "break-word",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {selected.description}
                  </p>
                </div>

                {/* 4. Photos (Gallery / Before & After Pair) */}
                {selected.evidence && selected.evidence.length > 0 && (
                  <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "18px" }}>
                    <PhotoGallery trackingId={selected.tracking_id} evidence={selected.evidence} />
                  </div>
                )}

                {/* 5. Location */}
                <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "18px" }}>
                  <h3 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-muted)", margin: "0 0 8px" }}>
                    Location
                  </h3>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "6px", marginBottom: "4px" }}>
                    <MapPin size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-ink)" }}>
                      {selected.location_text}
                    </span>
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--text-muted)", display: "flex", gap: "8px", alignItems: "center" }}>
                    <span>
                      {selected.latitude.toFixed(4)}° N, {selected.longitude.toFixed(4)}° E
                    </span>
                    <span>·</span>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${selected.latitude},${selected.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "var(--primary)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "3px" }}
                    >
                      <span>Open in Maps</span>
                      <ExternalLink size={12} />
                    </a>
                  </div>
                </div>

                {/* 6. Software suggestions & photo check */}
                {suggestions && (suggestions.primary_suggestion || suggestions.same_photo_hint || (suggestions.predictions && suggestions.predictions.length > 0)) && (
                  <div
                    style={{
                      borderTop: "1px solid var(--border-subtle)",
                      paddingTop: "18px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <h3 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-muted)", margin: 0 }}>
                        Photo check
                      </h3>
                      <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                        {suggestions.disclaimer}
                      </span>
                    </div>

                    {suggestions.same_photo_hint && (
                      <div
                        style={{
                          padding: "10px 12px",
                          borderRadius: "var(--radius-sm)",
                          backgroundColor: "var(--bg-subtle)",
                          border: "1px solid var(--border)",
                          fontSize: "12px",
                          color: "var(--text-ink)",
                        }}
                      >
                        {suggestions.same_photo_hint}
                      </div>
                    )}

                    {/* Look closer advisory card */}
                    {suggestions.authenticity_info && suggestions.authenticity_info.level === "look_closer" && (
                      <div
                        style={{
                          padding: "12px 14px",
                          borderRadius: "var(--radius-sm)",
                          backgroundColor: "rgba(194, 84, 10, 0.06)",
                          border: "1px solid rgba(194, 84, 10, 0.25)",
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span
                              style={{
                                fontSize: "11px",
                                fontWeight: 600,
                                textTransform: "uppercase",
                                letterSpacing: "0.04em",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                backgroundColor: "rgba(194, 84, 10, 0.15)",
                                color: "var(--priority-high, #C2540A)",
                              }}
                            >
                              Look closer
                            </span>
                            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                              Software signals noticed on this photo
                            </span>
                          </div>
                          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                            {suggestions.authenticity_info.disclaimer}
                          </span>
                        </div>

                        <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "12px", color: "var(--text-ink)", lineHeight: 1.5 }}>
                          {suggestions.authenticity_info.reasons.map((r, i) => (
                            <li key={i}>{r}</li>
                          ))}
                        </ul>

                        {(() => {
                          const authPred = suggestions.predictions?.find(p => p.kind === "photo_authenticity");
                          if (!authPred) return null;
                          return (
                            <div style={{ display: "flex", gap: "6px", alignItems: "center", alignSelf: "flex-end", marginTop: "2px" }}>
                              <button
                                type="button"
                                onClick={() => handleFeedback(authPred.id, "right")}
                                disabled={submittingFeedback === authPred.id}
                                style={{
                                  padding: "4px 8px",
                                  fontSize: "11px",
                                  borderRadius: "var(--radius-sm)",
                                  border: "1px solid var(--border)",
                                  backgroundColor: authPred.feedback === "right" ? "var(--primary)" : "var(--bg-surface)",
                                  color: authPred.feedback === "right" ? "#ffffff" : "var(--text-ink)",
                                  cursor: "pointer",
                                  fontWeight: 500,
                                }}
                              >
                                Looks right
                              </button>
                              <button
                                type="button"
                                onClick={() => handleFeedback(authPred.id, "wrong")}
                                disabled={submittingFeedback === authPred.id}
                                style={{
                                  padding: "4px 8px",
                                  fontSize: "11px",
                                  borderRadius: "var(--radius-sm)",
                                  border: "1px solid var(--border)",
                                  backgroundColor: authPred.feedback === "wrong" ? "var(--border)" : "var(--bg-surface)",
                                  color: "var(--text-ink)",
                                  cursor: "pointer",
                                  fontWeight: 500,
                                }}
                              >
                                Not right
                              </button>
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {suggestions.predictions && suggestions.predictions.filter(p => p.kind !== "photo_authenticity").map((p) => (
                      <div
                        key={p.id}
                        style={{
                          padding: "12px",
                          borderRadius: "var(--radius-sm)",
                          backgroundColor: "var(--bg-subtle)",
                          border: "1px solid var(--border)",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: "12px",
                        }}
                      >
                        <div style={{ fontSize: "13px", color: "var(--text-ink)" }}>
                          {p.display || "Photo suggests defect matches the category."}
                        </div>
                        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                          <button
                            type="button"
                            onClick={() => handleFeedback(p.id, "right")}
                            disabled={submittingFeedback === p.id}
                            style={{
                              padding: "4px 8px",
                              fontSize: "11px",
                              borderRadius: "var(--radius-sm)",
                              border: "1px solid var(--border)",
                              backgroundColor: p.feedback === "right" ? "var(--primary)" : "var(--bg-surface)",
                              color: p.feedback === "right" ? "#ffffff" : "var(--text-ink)",
                              cursor: "pointer",
                              fontWeight: 500,
                            }}
                          >
                            Looks right
                          </button>
                          <button
                            type="button"
                            onClick={() => handleFeedback(p.id, "wrong")}
                            disabled={submittingFeedback === p.id}
                            style={{
                              padding: "4px 8px",
                              fontSize: "11px",
                              borderRadius: "var(--radius-sm)",
                              border: "1px solid var(--border)",
                              backgroundColor: p.feedback === "wrong" ? "var(--border)" : "var(--bg-surface)",
                              color: "var(--text-ink)",
                              cursor: "pointer",
                              fontWeight: 500,
                            }}
                          >
                            Not right
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 7. Possible duplicate reports */}
                {duplicates && duplicates.length > 0 && (
                  <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "18px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "10px" }}>
                      <h3 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-muted)", margin: 0 }}>
                        Possible duplicate reports
                      </h3>
                      <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                        Found nearby with similar descriptions
                      </span>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {duplicates.map((cand) => (
                        <div
                          key={cand.id}
                          style={{
                            padding: "12px",
                            borderRadius: "var(--radius-sm)",
                            border: "1px solid var(--border)",
                            backgroundColor: "var(--bg-surface)",
                            display: "flex",
                            flexDirection: "column",
                            gap: "8px",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "12px", fontWeight: 600 }}>
                                {cand.tracking_id}
                              </span>
                              <StatusChip status={cand.status as any} />
                            </div>
                            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                              {cand.distance_meters} m away · {cand.days_apart} day{cand.days_apart === 1 ? "" : "s"} apart
                            </span>
                          </div>

                          <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-ink)" }}>
                            {cand.title}
                          </div>

                          <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                            {cand.location_text}
                          </div>

                          {cand.match_reasons && cand.match_reasons.length > 0 && (
                            <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                              Why: {cand.match_reasons.join(", ")}
                            </div>
                          )}

                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
                            {cand.existing_decision ? (
                              <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--primary)" }}>
                                {cand.existing_decision === "same_problem" ? "Linked: same problem" : "Marked: different problem"}
                              </span>
                            ) : (
                              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                <button
                                  type="button"
                                  onClick={() => handleDuplicateDecision(cand.tracking_id, "same_problem")}
                                  disabled={submittingDuplicate === cand.tracking_id}
                                  className="btn-secondary"
                                  style={{ padding: "4px 10px", fontSize: "12px" }}
                                >
                                  Same problem
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDuplicateDecision(cand.tracking_id, "different_problem")}
                                  disabled={submittingDuplicate === cand.tracking_id}
                                  className="btn-ghost"
                                  style={{ padding: "4px 8px", fontSize: "12px", color: "var(--text-muted)" }}
                                >
                                  Different problem
                                </button>
                              </div>
                            )}

                            <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "var(--text-muted)", cursor: "pointer" }}>
                              <input
                                type="checkbox"
                                checked={propagateUpdate}
                                onChange={(e) => setPropagateUpdate(e.target.checked)}
                              />
                              <span>Keep resident updated</span>
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Similar reports at this place (Clustering) */}
                {cluster && cluster.is_clustered && cluster.members && cluster.members.length > 0 && (
                  <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "18px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "10px" }}>
                      <h3 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-muted)", margin: 0 }}>
                        Similar reports at this place ({cluster.members.length} nearby)
                      </h3>
                      <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                        Within {cluster.category === "manhole" ? "30m" : cluster.category === "road_damage" ? "60m" : cluster.category === "garbage" ? "100m" : "200m"}
                      </span>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {cluster.members.map((m) => (
                        <div
                          key={m.complaint_id}
                          style={{
                            padding: "12px",
                            borderRadius: "var(--radius-sm)",
                            border: "1px solid var(--border)",
                            backgroundColor: "var(--bg-surface)",
                            display: "flex",
                            flexDirection: "column",
                            gap: "8px",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "12px", fontWeight: 600 }}>
                                {m.tracking_id}
                              </span>
                              <StatusChip status={m.status as any} />
                            </div>
                            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                              {Math.round(m.distance_meters)} m away · {m.days_apart} day{m.days_apart === 1 ? "" : "s"} apart
                            </span>
                          </div>

                          <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-ink)" }}>
                            {m.title}
                          </div>

                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
                            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                              {m.added_by === "officer" ? "Confirmed by officer" : "Suggested cluster"}
                            </span>
                            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                              <button
                                type="button"
                                onClick={() => handleClusterDecision("same_problem")}
                                disabled={submittingClusterDecision}
                                className="btn-secondary"
                                style={{ padding: "4px 8px", fontSize: "11px" }}
                              >
                                Same problem
                              </button>
                              <button
                                type="button"
                                onClick={() => handleClusterDecision("different_problem")}
                                disabled={submittingClusterDecision}
                                className="btn-ghost"
                                style={{ padding: "4px 8px", fontSize: "11px", color: "var(--text-muted)" }}
                              >
                                Different problem
                              </button>
                              <button
                                type="button"
                                onClick={() => handleClusterDecision("came_back")}
                                disabled={submittingClusterDecision}
                                className="btn-ghost"
                                style={{ padding: "4px 8px", fontSize: "11px", color: "var(--text-muted)" }}
                              >
                                Came back
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 8. Why this order */}
                <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "18px" }}>
                  <h3 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-muted)", margin: "0 0 8px" }}>
                    Why this order
                  </h3>
                  <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.6 }}>
                    {suggestions?.priority_info?.why_this_order && suggestions.priority_info.why_this_order.length > 0 ? (
                      suggestions.priority_info.why_this_order.map((rationale, idx) => (
                        <li key={idx}>{rationale}</li>
                      ))
                    ) : (
                      <>
                        <li>Location is confirmed on the municipal map</li>
                        <li>{formatPlural(selected.evidence?.length || 0, "photo")} attached</li>
                        <li>Priority follows the category target deadline</li>
                      </>
                    )}
                  </ul>
                </div>

                {/* 7. Updates Timeline */}
                <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "18px" }}>
                  <h3 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-muted)", margin: "0 0 12px" }}>
                    Updates
                  </h3>
                  {selected.events && selected.events.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      {selected.events.map((ev) => (
                        <div key={ev.id} style={{ display: "flex", gap: "10px", fontSize: "13px" }}>
                          <span style={{ color: "var(--text-muted)", fontSize: "12px", whiteSpace: "nowrap" }}>
                            {formatDateTime(ev.created_at)}
                          </span>
                          <div>
                            <span style={{ fontWeight: 600, marginRight: "6px" }}>
                              {PLAIN_STATUS_LABELS[ev.status] || ev.status}:
                            </span>
                            <span style={{ color: "var(--text-ink)", wordBreak: "break-word" }}>
                              {ev.note}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                      Report received. Awaiting officer review.
                    </div>
                  )}
                </div>
              </div>

              {/* Docked Actions Panel on desktop (≥ 1360px) */}
              <div
                className="docked-action-panel"
                style={{
                  width: "320px",
                  flexShrink: 0,
                  borderLeft: "1px solid var(--border-subtle)",
                  backgroundColor: "var(--bg-surface)",
                  padding: "20px",
                  overflowY: "auto",
                  boxSizing: "border-box",
                }}
              >
                <OfficerActionControls
                  selected={selected}
                  fieldWorkers={fieldWorkers}
                  onAssign={handleAssignWorker}
                  onSaveUpdate={handleSaveUpdate}
                  isSubmitting={submitting}
                  isAssigning={assigning}
                  idPrefix="docked"
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Sticky Bottom Bar for Mobile (< 1024px) */}
      <div
        className="mobile-sticky-action-bar"
        style={{
          display: "none",
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "12px 16px",
          backgroundColor: "var(--bg-surface)",
          borderTop: "1px solid var(--border)",
          boxShadow: "0 -2px 10px rgba(0,0,0,0.06)",
          zIndex: 50,
        }}
      >
        <button
          type="button"
          className="btn-primary"
          onClick={() => setMobileSheetOpen(true)}
          style={{ width: "100%", justifyContent: "center", padding: "12px" }}
        >
          Update report
        </button>
      </div>

      {/* Mobile Action Sheet Modal */}
      {mobileSheetOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            zIndex: 60,
            display: "flex",
            alignItems: "flex-end",
          }}
          onClick={() => setMobileSheetOpen(false)}
        >
          <div
            style={{
              width: "100%",
              maxHeight: "80vh",
              overflowY: "auto",
              backgroundColor: "var(--bg-surface)",
              borderRadius: "16px 16px 0 0",
              padding: "20px",
              boxSizing: "border-box",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <span style={{ fontSize: "16px", fontWeight: 600 }}>Update report</span>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setMobileSheetOpen(false)}
                style={{ padding: "4px" }}
              >
                <X size={18} />
              </button>
            </div>
            {selected && (
              <OfficerActionControls
                selected={selected}
                fieldWorkers={fieldWorkers}
                onAssign={handleAssignWorker}
                onSaveUpdate={handleSaveUpdate}
                isSubmitting={submitting}
                isAssigning={assigning}
                idPrefix="sheet"
              />
            )}
          </div>
        </div>
      )}

      {/* Responsive layout styles */}
      <style jsx>{`
        @media (max-width: 1359px) {
          .docked-action-panel {
            display: none !important;
          }
          .inline-action-section {
            display: block !important;
          }
        }
        @media (max-width: 1023px) {
          .officer-viewport-container {
            padding: 0 16px 12px !important;
          }
          :global(.officer-list-pane),
          :global(.officer-detail-pane) {
            width: 100% !important;
            border-radius: var(--radius-md) !important;
            border-right: 1px solid var(--border) !important;
          }
          .mobile-only-back {
            display: block !important;
          }
          .mobile-sticky-action-bar {
            display: block !important;
          }
          .mobile-hidden-pane {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
