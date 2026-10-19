"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Clock,
  Copy,
  Edit2,
  FolderCheck,
  History,
  Mail,
  MoreVertical,
  Plus,
  RefreshCw,
  Search,
  Settings as SettingsIcon,
  Shield,
  Smartphone,
  Trash2,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
  Filter,
} from "lucide-react";
import { toast } from "sonner";
import { toList } from "@grievancegrid/api-client";
import Link from "next/link";
import { StatusChip } from "../../../components/StatusChip";
import { PageContainer } from "../../../components/Layout";
import { getStoredAuth } from "../../../lib/auth";
import { showToastError } from "../../../lib/api";
import { PLAIN_ROLE_LABELS, formatDateTime, formatPlural } from "../../../lib/labels";
import { AdminSettingsPane } from "../../../components/AdminSettingsPane";

type AdminTab = "overview" | "people" | "categories" | "activity" | "settings";

interface AdminOverviewData {
  open_reports_count: number;
  overdue_reports_count: number;
  active_staff_count: number;
  pending_invites_count: number;
  needs_attention: Array<{
    type: string;
    title: string;
    subtitle: string;
    link: string;
  }>;
}

interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  phone: string | null;
  team_id: string | null;
  team_name: string | null;
  last_active_at: string | null;
  open_reports?: number;
  created_at: string;
}

interface CategoryItem {
  id: string;
  code: string;
  label: string;
  description: string;
  target_hours: number;
  target_days: number;
  icon: string;
  active: boolean;
  photo_rule?: "required" | "recommended" | "optional";
  default_team_id: string | null;
  default_team_name: string | null;
  open_reports_count: number;
}

interface TeamItem {
  id: string;
  name: string;
  description: string | null;
  member_count: number;
}

interface AuditItem {
  id: string;
  actor_name: string;
  action: string;
  target_type: string;
  details: string;
  created_at: string;
}

export default function AdminControlCentre() {
  const auth = getStoredAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [loading, setLoading] = useState(true);

  // Overview data
  const [overview, setOverview] = useState<AdminOverviewData | null>(null);

  // People data
  const [people, setPeople] = useState<StaffUser[]>([]);
  const [peopleTotal, setPeopleTotal] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [inviteSheetOpen, setInviteSheetOpen] = useState(false);

  // Invite form
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePhone, setInvitePhone] = useState("");
  const [inviteRole, setInviteRole] = useState("field_officer");
  const [inviteTeam, setInviteTeam] = useState("");
  const [inviteSubmitting, setInviteSubmitting] = useState(false);

  // Categories data
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [categorySheetOpen, setCategorySheetOpen] = useState(false);
  const [catName, setCatName] = useState("");
  const [catCode, setCatCode] = useState("");
  const [catDesc, setCatDesc] = useState("");
  const [catHours, setCatHours] = useState(48);
  const [catTeam, setCatTeam] = useState("");
  const [catPhotoRule, setCatPhotoRule] = useState<"required" | "recommended" | "optional">("recommended");
  const [catSubmitting, setCatSubmitting] = useState(false);

  // Teams & Activity
  const [teams, setTeams] = useState<TeamItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditItem[]>([]);
  const [activitySearch, setActivitySearch] = useState("");
  const [activityDateFilter, setActivityDateFilter] = useState("");

  // Settings form
  const [areaName, setAreaName] = useState("City Municipality");
  const [emergencyPhone, setEmergencyPhone] = useState("112");
  const [defaultTargetHours, setDefaultTargetHours] = useState(48);
  const [emailSenderName, setEmailSenderName] = useState("City Municipality Team");
  const [emailReportUpdates, setEmailReportUpdates] = useState(true);
  const [emailNewJobs, setEmailNewJobs] = useState(true);
  const [emailInvites, setEmailInvites] = useState(true);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Read-only complaint modal
  const [readOnlyComplaint, setReadOnlyComplaint] = useState<any | null>(null);
  const [loadingComplaintModal, setLoadingComplaintModal] = useState(false);

  // Suggestions admin settings & summary
  const [suggestionSummary, setSuggestionSummary] = useState<any | null>(null);
  const [photoCheckEnabled, setPhotoCheckEnabled] = useState(true);
  const [duplicateMatchEnabled, setDuplicateMatchEnabled] = useState(true);
  const [priorityEngineEnabled, setPriorityEngineEnabled] = useState(true);
  const [citizenPhotoHintEnabled, setCitizenPhotoHintEnabled] = useState(true);

  useEffect(() => {
    if (activeTab === "settings") {
      fetch("/api/v1/admin/suggestions/summary", {
        headers: { Authorization: `Bearer ${auth?.access_token}` },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data) setSuggestionSummary(data);
        })
        .catch(() => {});
    }
  }, [activeTab, auth]);

  const handleOpenComplaintModal = async (link: string) => {
    const match = link.match(/[?&]id=([^&]+)/) || link.match(/\/([A-Za-z0-9_-]+)$/);
    const tracking = match ? match[1] : null;
    if (!tracking) {
      window.location.href = link;
      return;
    }
    setLoadingComplaintModal(true);
    try {
      const res = await fetch(`/api/v1/complaints/${encodeURIComponent(tracking)}`, {
        headers: { Authorization: `Bearer ${auth?.access_token}` },
      });
      if (res.ok) {
        setReadOnlyComplaint(await res.json());
      } else {
        window.location.href = link;
      }
    } catch {
      window.location.href = link;
    } finally {
      setLoadingComplaintModal(false);
    }
  };

  // Dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    action: () => Promise<void>;
  }>({ open: false, title: "", description: "", action: async () => {} });

  const headers = {
    Authorization: `Bearer ${auth?.access_token}`,
    "Content-Type": "application/json",
  };

  const loadOverview = async () => {
    try {
      const res = await fetch("/api/v1/admin/overview", { headers });
      if (res.ok) setOverview(await res.json());
    } catch {
      // Ignored
    }
  };

  const loadPeople = async () => {
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set("search", searchQuery);
      if (roleFilter !== "all") params.set("role", roleFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await fetch(`/api/v1/admin/users?${params.toString()}`, { headers });
      if (res.ok) {
        const raw = await res.json();
        const items = toList<StaffUser>(raw.items || raw);
        setPeople(items);
        setPeopleTotal(raw.total || items.length);
      }
    } catch {
      // Ignored
    }
  };

  const loadCategories = async () => {
    try {
      const res = await fetch("/api/v1/admin/categories", { headers });
      if (res.ok) {
        const raw = await res.json();
        setCategories(toList<CategoryItem>(raw));
      }
    } catch {
      // Ignored
    }
  };

  const loadTeams = async () => {
    try {
      const res = await fetch("/api/v1/admin/teams", { headers });
      if (res.ok) {
        const raw = await res.json();
        setTeams(toList<TeamItem>(raw));
      }
    } catch {
      // Ignored
    }
  };

  const loadAuditHistory = async () => {
    try {
      const res = await fetch("/api/v1/admin/audit-log", { headers });
      if (res.ok) {
        const raw = await res.json();
        // Defensive: uses toList so objects like {items: [...], total: ...} become arrays
        setAuditLogs(toList<AuditItem>(raw));
      }
    } catch {
      // Ignored
    }
  };

  const refreshAll = async () => {
    setLoading(true);
    await Promise.all([loadOverview(), loadPeople(), loadCategories(), loadTeams(), loadAuditHistory()]);
    setLoading(false);
  };

  useEffect(() => {
    refreshAll();
  }, []);

  useEffect(() => {
    if (activeTab === "people") loadPeople();
  }, [searchQuery, roleFilter, statusFilter, activeTab]);

  // Handle staff invite
  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteSubmitting(true);
    try {
      const res = await fetch("/api/v1/admin/users/invite", {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: inviteName,
          email: inviteEmail,
          phone: invitePhone || null,
          role: inviteRole,
          team_id: inviteTeam || null,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        toast.success(`Invite sent to ${inviteEmail}.`);
        setInviteName("");
        setInviteEmail("");
        setInvitePhone("");
        setInviteSheetOpen(false);
        loadPeople();
        loadOverview();
      } else {
        const err = await res.json();
        showToastError(err, "Could not send invitation.");
      }
    } catch (err) {
      showToastError(err, "Could not send invitation.");
    } finally {
      setInviteSubmitting(false);
    }
  };

  // Handle user disable / re-enable
  const handleToggleUser = async (userId: string, currentActive: boolean) => {
    const action = currentActive ? "disable" : "enable";
    try {
      const res = await fetch(`/api/v1/admin/users/${userId}/${action}`, {
        method: "POST",
        headers,
      });
      if (res.ok) {
        toast.success(`User account ${currentActive ? "disabled" : "enabled"}.`);
        loadPeople();
      } else {
        const err = await res.json();
        showToastError(err, "Could not update user account.");
      }
    } catch (err) {
      showToastError(err, "Could not update user account.");
    }
  };

  // Handle add category
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setCatSubmitting(true);
    try {
      const code = catCode || catName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
      const res = await fetch("/api/v1/admin/categories", {
        method: "POST",
        headers,
        body: JSON.stringify({
          code,
          label: catName,
          description: catDesc,
          target_hours: catHours,
          icon: "AlertCircle",
          photo_rule: catPhotoRule,
          default_team_id: catTeam || null,
          active: true,
        }),
      });

      if (res.ok) {
        toast.success("Category created.");
        setCatName("");
        setCatCode("");
        setCatDesc("");
        setCatTeam("");
        setCatPhotoRule("recommended");
        setCategorySheetOpen(false);
        loadCategories();
      } else {
        const err = await res.json();
        showToastError(err, "Could not create category.");
      }
    } catch (err) {
      showToastError(err, "Could not create category.");
    } finally {
      setCatSubmitting(false);
    }
  };

  // Handle category toggle
  const handleToggleCategory = async (catId: string, currentActive: boolean) => {
    try {
      const res = await fetch(`/api/v1/admin/categories/${catId}/toggle`, {
        method: "PATCH",
        headers,
      });
      if (res.ok) {
        toast.success(`Category ${currentActive ? "turned off" : "activated"}.`);
        loadCategories();
      } else {
        const err = await res.json();
        showToastError(err, "Could not update category.");
      }
    } catch (err) {
      showToastError(err, "Could not update category.");
    }
  };

  // Filtered audit logs
  const filteredAuditLogs = useMemo(() => {
    return auditLogs.filter((log) => {
      if (activitySearch.trim()) {
        const q = activitySearch.toLowerCase();
        const match =
          log.actor_name?.toLowerCase().includes(q) ||
          log.action?.toLowerCase().includes(q) ||
          log.details?.toLowerCase().includes(q);
        if (!match) return false;
      }
      if (activityDateFilter) {
        if (!log.created_at?.startsWith(activityDateFilter)) return false;
      }
      return true;
    });
  }, [auditLogs, activitySearch, activityDateFilter]);

  return (
    <PageContainer>
      {/* Page Title & Actions in Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "20px",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600, color: "var(--text-ink)", margin: 0 }}>
            Admin
          </h1>
          {activeTab === "overview" && (
            <p style={{ margin: "4px 0 0", color: "var(--text-muted)", fontSize: "0.85rem" }}>
              Admins look after people and settings. Officers decide on reports.
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              setActiveTab("people");
              setInviteSheetOpen(true);
            }}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", minHeight: "36px" }}
          >
            <UserPlus size={15} />
            <span>Add person</span>
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setActiveTab("categories");
              setCategorySheetOpen(true);
            }}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", minHeight: "36px" }}
          >
            <Plus size={15} />
            <span>Add category</span>
          </button>
        </div>
      </div>

      {/* Main Admin Shell with Left Rail Tabs */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "220px 1fr",
          gap: "24px",
          alignItems: "start",
        }}
        className="admin-layout-grid"
      >
        {/* Left Rail Navigation: Plain text, no card border, active marked by 2px left bar */}
        <aside
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "2px",
            padding: "0",
            backgroundColor: "transparent",
          }}
          aria-label="Admin navigation tabs"
        >
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            style={{
              padding: "8px 12px",
              borderRadius: "0",
              border: "none",
              borderLeft: activeTab === "overview" ? "2px solid var(--brand-primary, #0284c7)" : "2px solid transparent",
              background: activeTab === "overview" ? "var(--bg-subtle, rgba(0,0,0,0.03))" : "transparent",
              color: activeTab === "overview" ? "var(--text-ink)" : "var(--text-secondary)",
              fontWeight: activeTab === "overview" ? 600 : 400,
              fontSize: "0.875rem",
              textAlign: "left",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              transition: "all 150ms ease",
            }}
          >
            <Shield size={16} />
            <span>Overview</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("people")}
            style={{
              padding: "8px 12px",
              borderRadius: "0",
              border: "none",
              borderLeft: activeTab === "people" ? "2px solid var(--brand-primary, #0284c7)" : "2px solid transparent",
              background: activeTab === "people" ? "var(--bg-subtle, rgba(0,0,0,0.03))" : "transparent",
              color: activeTab === "people" ? "var(--text-ink)" : "var(--text-secondary)",
              fontWeight: activeTab === "people" ? 600 : 400,
              fontSize: "0.875rem",
              textAlign: "left",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              transition: "all 150ms ease",
            }}
          >
            <Users size={16} />
            <span>
              People <span style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>({peopleTotal || people.length})</span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("categories")}
            style={{
              padding: "8px 12px",
              borderRadius: "0",
              border: "none",
              borderLeft: activeTab === "categories" ? "2px solid var(--brand-primary, #0284c7)" : "2px solid transparent",
              background: activeTab === "categories" ? "var(--bg-subtle, rgba(0,0,0,0.03))" : "transparent",
              color: activeTab === "categories" ? "var(--text-ink)" : "var(--text-secondary)",
              fontWeight: activeTab === "categories" ? 600 : 400,
              fontSize: "0.875rem",
              textAlign: "left",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              transition: "all 150ms ease",
            }}
          >
            <FolderCheck size={16} />
            <span>
              Categories <span style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>({categories.length})</span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("activity")}
            style={{
              padding: "8px 12px",
              borderRadius: "0",
              border: "none",
              borderLeft: activeTab === "activity" ? "2px solid var(--brand-primary, #0284c7)" : "2px solid transparent",
              background: activeTab === "activity" ? "var(--bg-subtle, rgba(0,0,0,0.03))" : "transparent",
              color: activeTab === "activity" ? "var(--text-ink)" : "var(--text-secondary)",
              fontWeight: activeTab === "activity" ? 600 : 400,
              fontSize: "0.875rem",
              textAlign: "left",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              transition: "all 150ms ease",
            }}
          >
            <History size={16} />
            <span>Activity</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("settings")}
            style={{
              padding: "8px 12px",
              borderRadius: "0",
              border: "none",
              borderLeft: activeTab === "settings" ? "2px solid var(--brand-primary, #0284c7)" : "2px solid transparent",
              background: activeTab === "settings" ? "var(--bg-subtle, rgba(0,0,0,0.03))" : "transparent",
              color: activeTab === "settings" ? "var(--text-ink)" : "var(--text-secondary)",
              fontWeight: activeTab === "settings" ? 600 : 400,
              fontSize: "0.875rem",
              textAlign: "left",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              transition: "all 150ms ease",
            }}
          >
            <SettingsIcon size={16} />
            <span>Settings</span>
          </button>
        </aside>

        {/* Tab Content Area */}
        <main style={{ minWidth: 0 }}>
          {/* TAB 1: OVERVIEW */}
          {activeTab === "overview" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Four summary numbers in one row with hairlines */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  backgroundColor: "var(--bg-surface)",
                  overflow: "hidden",
                }}
              >
                <div style={{ padding: "18px 20px" }}>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 500 }}>
                    Staff
                  </span>
                  <div style={{ fontSize: "1.75rem", fontWeight: 600, color: "var(--text-ink)", margin: "4px 0", fontVariantNumeric: "tabular-nums" }}>
                    {overview?.active_staff_count ?? people.filter((p) => p.status === "active").length}
                  </div>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    active
                  </span>
                </div>

                <div style={{ padding: "18px 20px", borderLeft: "1px solid var(--border)" }}>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 500 }}>
                    Invites waiting
                  </span>
                  <div style={{ fontSize: "1.75rem", fontWeight: 600, color: "var(--text-ink)", margin: "4px 0", fontVariantNumeric: "tabular-nums" }}>
                    {overview?.pending_invites_count ?? people.filter((p) => p.status === "invited").length}
                  </div>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    waiting
                  </span>
                </div>

                <div style={{ padding: "18px 20px", borderLeft: "1px solid var(--border)" }}>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 500 }}>
                    Categories
                  </span>
                  <div style={{ fontSize: "1.75rem", fontWeight: 600, color: "var(--text-ink)", margin: "4px 0", fontVariantNumeric: "tabular-nums" }}>
                    {categories.length}
                  </div>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    active
                  </span>
                </div>

                <div style={{ padding: "18px 20px", borderLeft: "1px solid var(--border)" }}>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 500 }}>
                    Teams
                  </span>
                  <div style={{ fontSize: "1.75rem", fontWeight: 600, color: "var(--text-ink)", margin: "4px 0", fontVariantNumeric: "tabular-nums" }}>
                    {teams.length}
                  </div>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    active
                  </span>
                </div>
              </div>

              {/* Needs attention list */}
              <div
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  padding: "18px 20px",
                  backgroundColor: "var(--bg-surface)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
                  <AlertTriangle size={16} color="var(--primary)" />
                  <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-ink)" }}>
                    Needs attention
                  </span>
                </div>

                {overview?.needs_attention && overview.needs_attention.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {overview.needs_attention.map((item, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "10px 14px",
                          borderRadius: "var(--radius-sm)",
                          backgroundColor: "var(--bg-subtle)",
                          gap: "12px",
                        }}
                      >
                        <div>
                          <div style={{ fontSize: "0.85rem", fontWeight: 500, color: "var(--text-ink)" }}>
                            {item.title}
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                            {item.subtitle}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleOpenComplaintModal(item.link)}
                          disabled={loadingComplaintModal}
                          className="btn-secondary"
                          style={{
                            padding: "4px 10px",
                            fontSize: "0.75rem",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            whiteSpace: "nowrap",
                            cursor: "pointer",
                          }}
                        >
                          <span>Open</span>
                          <ChevronRight size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                    Nothing requires urgent administrative attention today.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: PEOPLE */}
          {activeTab === "people" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
                <div>
                  <h2 style={{ fontSize: "1.1rem", fontWeight: 600, margin: 0, color: "var(--text-ink)" }}>
                    People
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={() => setInviteSheetOpen(true)}
                  className="btn-primary"
                  style={{ display: "flex", alignItems: "center", gap: "6px", minHeight: "36px" }}
                >
                  <UserPlus size={15} />
                  <span>Add staff member</span>
                </button>
              </div>

              {/* Search & filters */}
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <div style={{ position: "relative", flex: 1, minWidth: "220px" }}>
                  <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                  <input
                    type="text"
                    placeholder="Search by name or email…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      width: "100%",
                      paddingLeft: "30px",
                      height: "36px",
                      fontSize: "0.825rem",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border)",
                      backgroundColor: "var(--bg-surface)",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  style={{
                    height: "36px",
                    fontSize: "0.8rem",
                    padding: "0 10px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--bg-surface)",
                  }}
                >
                  <option value="all">All roles</option>
                  <option value="gro">Officer</option>
                  <option value="field_officer">Field worker</option>
                  <option value="supervisor">Senior authority</option>
                  <option value="admin">Admin</option>
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  style={{
                    height: "36px",
                    fontSize: "0.8rem",
                    padding: "0 10px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--bg-surface)",
                  }}
                >
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="invited">Invited</option>
                  <option value="disabled">Disabled</option>
                </select>
              </div>

              {/* People Table */}
              <div
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  backgroundColor: "var(--bg-surface)",
                  overflowX: "auto",
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.825rem", textAlign: "left" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-muted)" }}>
                      <th style={{ padding: "10px 14px", fontWeight: 600 }}>Name</th>
                      <th style={{ padding: "10px 14px", fontWeight: 600 }}>Role</th>
                      <th style={{ padding: "10px 14px", fontWeight: 600 }}>Team</th>
                      <th style={{ padding: "10px 14px", fontWeight: 600 }}>Last active</th>
                      <th style={{ padding: "10px 14px", fontWeight: 600 }}>Open reports</th>
                      <th style={{ padding: "10px 14px", fontWeight: 600 }}>Status</th>
                      <th style={{ padding: "10px 14px", fontWeight: 600, textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {people.map((u) => (
                      <tr key={u.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "12px 14px" }}>
                          <div style={{ fontWeight: 600, color: "var(--text-ink)" }}>{u.name}</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{u.email}</div>
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          {PLAIN_ROLE_LABELS[u.role] || u.role}
                        </td>
                        <td style={{ padding: "12px 14px", color: "var(--text-muted)" }}>
                          {u.team_name || "–"}
                        </td>
                        <td style={{ padding: "12px 14px", color: "var(--text-muted)", fontSize: "0.78rem" }}>
                          {u.last_active_at ? formatDateTime(u.last_active_at) : "–"}
                        </td>
                        <td style={{ padding: "12px 14px", color: "var(--text-ink)", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
                          {(u.role === "gro" || u.role === "field_officer") ? (u.open_reports ?? 0) : "–"}
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: "12px",
                              fontSize: "0.72rem",
                              fontWeight: 500,
                              backgroundColor:
                                u.status === "active"
                                  ? "var(--success-subtle, rgba(30, 122, 76, 0.1))"
                                  : "var(--bg-subtle)",
                              color:
                                u.status === "active"
                                  ? "var(--success, #1E7A4C)"
                                  : "var(--text-muted)",
                            }}
                          >
                            {u.status}
                          </span>
                        </td>
                        <td style={{ padding: "12px 14px", textAlign: "right" }}>
                          <button
                            type="button"
                            onClick={() => handleToggleUser(u.id, u.status === "active")}
                            className="btn-secondary"
                            style={{ padding: "4px 8px", fontSize: "0.75rem", minHeight: "28px" }}
                          >
                            {u.status === "active" ? "Disable" : "Enable"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: CATEGORIES */}
          {activeTab === "categories" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
                <div>
                  <h2 style={{ fontSize: "1.1rem", fontWeight: 600, margin: 0, color: "var(--text-ink)" }}>
                    Categories
                  </h2>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    Service types available for citizen reporting and evidence requirements
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setCategorySheetOpen(true)}
                  className="btn-primary"
                  style={{ display: "flex", alignItems: "center", gap: "6px", minHeight: "36px" }}
                >
                  <Plus size={15} />
                  <span>Add category</span>
                </button>
              </div>

              {/* Categories Table */}
              <div
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  backgroundColor: "var(--bg-surface)",
                  overflowX: "auto",
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.825rem", textAlign: "left" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-muted)" }}>
                      <th style={{ padding: "10px 14px", fontWeight: 600 }}>Category</th>
                      <th style={{ padding: "10px 14px", fontWeight: 600 }}>Photo rule</th>
                      <th style={{ padding: "10px 14px", fontWeight: 600 }}>Target time</th>
                      <th style={{ padding: "10px 14px", fontWeight: 600 }}>Team</th>
                      <th style={{ padding: "10px 14px", fontWeight: 600, textAlign: "right" }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((c) => (
                      <tr key={c.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "12px 14px" }}>
                          <div style={{ fontWeight: 600, color: "var(--text-ink)" }}>{c.label}</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{c.description}</div>
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: "10px",
                              fontSize: "0.72rem",
                              fontWeight: 500,
                              backgroundColor:
                                c.photo_rule === "required"
                                  ? "var(--priority-high-subtle, rgba(194, 84, 10, 0.1))"
                                  : "var(--bg-subtle)",
                              color:
                                c.photo_rule === "required"
                                  ? "var(--priority-high, #C2540A)"
                                  : "var(--text-ink)",
                            }}
                          >
                            {c.photo_rule ? c.photo_rule.charAt(0).toUpperCase() + c.photo_rule.slice(1) : "Optional"}
                          </span>
                        </td>
                        <td style={{ padding: "12px 14px", color: "var(--text-muted)" }}>
                          {c.target_days || Math.round(c.target_hours / 24)} days
                        </td>
                        <td style={{ padding: "12px 14px", color: "var(--text-muted)" }}>
                          {c.default_team_name || "–"}
                        </td>
                        <td style={{ padding: "12px 14px", textAlign: "right" }}>
                          <button
                            type="button"
                            onClick={() => handleToggleCategory(c.id, c.active)}
                            style={{
                              padding: "4px 10px",
                              borderRadius: "14px",
                              border: "1px solid var(--border)",
                              backgroundColor: c.active ? "var(--primary-subtle, rgba(29, 78, 216, 0.08))" : "var(--bg-subtle)",
                              color: c.active ? "var(--primary)" : "var(--text-muted)",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            {c.active ? "Active" : "Off"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: ACTIVITY (With defensive toList & filters) */}
          {activeTab === "activity" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
                <div>
                  <h2 style={{ fontSize: "1.1rem", fontWeight: 600, margin: 0, color: "var(--text-ink)" }}>
                    Activity history
                  </h2>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    Audit log of administrative and supervisory events
                  </span>
                </div>

                {/* Filters by person and date */}
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <input
                    type="text"
                    placeholder="Filter by person…"
                    value={activitySearch}
                    onChange={(e) => setActivitySearch(e.target.value)}
                    style={{
                      padding: "6px 10px",
                      fontSize: "0.8rem",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border)",
                    }}
                  />
                  <input
                    type="date"
                    value={activityDateFilter}
                    onChange={(e) => setActivityDateFilter(e.target.value)}
                    style={{
                      padding: "6px 8px",
                      fontSize: "0.8rem",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border)",
                    }}
                  />
                  {(activitySearch || activityDateFilter) && (
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => {
                        setActivitySearch("");
                        setActivityDateFilter("");
                      }}
                      style={{ fontSize: "0.75rem", padding: "4px 8px" }}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {filteredAuditLogs.length === 0 ? (
                <div
                  style={{
                    padding: "48px 16px",
                    textAlign: "center",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-md)",
                    backgroundColor: "var(--bg-surface)",
                    color: "var(--text-muted)",
                    fontSize: "0.85rem",
                  }}
                >
                  No administrative actions match these filters.
                </div>
              ) : (
                <div
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-md)",
                    backgroundColor: "var(--bg-surface)",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  {filteredAuditLogs.map((log, idx) => (
                    <div
                      key={log.id || idx}
                      style={{
                        padding: "12px 16px",
                        borderBottom: idx < filteredAuditLogs.length - 1 ? "1px solid var(--border)" : "none",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: "12px",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: "0.85rem", fontWeight: 500, color: "var(--text-ink)" }}>
                          <strong>{log.actor_name}</strong> performed <span>{log.action}</span> on {log.target_type}
                        </div>
                        {log.details && (
                          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "2px" }}>
                            {log.details}
                          </div>
                        )}
                      </div>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                        {formatDateTime(log.created_at)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: SETTINGS */}
          {activeTab === "settings" && (
            <AdminSettingsPane
              authToken={auth?.access_token}
              onNavigateToCategories={() => setActiveTab("categories")}
              suggestionSummary={suggestionSummary}
            />
          )}
        </main>
      </div>

      {/* Slide-out Sheet: Add Staff Member */}
      {inviteSheetOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            zIndex: 200,
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "440px",
              height: "100%",
              backgroundColor: "var(--bg-surface)",
              padding: "28px",
              display: "flex",
              flexDirection: "column",
              boxShadow: "-4px 0 20px rgba(0,0,0,0.15)",
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <h2 style={{ fontSize: "1.2rem", fontWeight: 600, margin: 0, color: "var(--text-ink)" }}>
                Add staff member
              </h2>
              <button
                type="button"
                onClick={() => setInviteSheetOpen(false)}
                className="btn-ghost"
                style={{ padding: "6px" }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: "0.825rem", color: "var(--text-muted)", margin: "0 0 20px 0", lineHeight: 1.5 }}>
              The staff member will receive a one-time invitation link valid for 72 hours where they set their password.
            </p>

            <form onSubmit={handleSendInvite} style={{ display: "flex", flexDirection: "column", gap: "14px", flex: 1 }}>
              <div>
                <label className="field-label" htmlFor="inv-name" style={{ fontSize: "0.8rem", marginBottom: "4px" }}>
                  Full name
                </label>
                <input
                  id="inv-name"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  required
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    fontSize: "0.85rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border)",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label className="field-label" htmlFor="inv-email" style={{ fontSize: "0.8rem", marginBottom: "4px" }}>
                  Work email
                </label>
                <input
                  id="inv-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    fontSize: "0.85rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border)",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label className="field-label" htmlFor="inv-phone" style={{ fontSize: "0.8rem", marginBottom: "4px" }}>
                  Phone number (optional)
                </label>
                <input
                  id="inv-phone"
                  value={invitePhone}
                  onChange={(e) => setInvitePhone(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    fontSize: "0.85rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border)",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label className="field-label" htmlFor="inv-role" style={{ fontSize: "0.8rem", marginBottom: "4px" }}>
                  Role
                </label>
                <select
                  id="inv-role"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    fontSize: "0.85rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border)",
                    boxSizing: "border-box",
                  }}
                >
                  <option value="gro">Officer (Reviews reports and dispatches work)</option>
                  <option value="field_officer">Field worker (Carries out on-site repairs)</option>
                  <option value="supervisor">Senior authority (Monitors standards and wards)</option>
                  <option value="admin">Admin (Manages categories and people)</option>
                </select>
              </div>

              <div>
                <label className="field-label" htmlFor="inv-team" style={{ fontSize: "0.8rem", marginBottom: "4px" }}>
                  Assigned team
                </label>
                <select
                  id="inv-team"
                  value={inviteTeam}
                  onChange={(e) => setInviteTeam(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    fontSize: "0.85rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border)",
                    boxSizing: "border-box",
                  }}
                >
                  <option value="">None (General)</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginTop: "auto", display: "flex", gap: "10px", paddingTop: "16px" }}>
                <button
                  type="button"
                  onClick={() => setInviteSheetOpen(false)}
                  className="btn-secondary"
                  style={{ flex: 1, minHeight: "38px" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviteSubmitting}
                  className="btn-primary"
                  style={{ flex: 1, minHeight: "38px" }}
                >
                  {inviteSubmitting ? "Sending invite…" : "Send invitation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Slide-out Sheet: Add Category */}
      {categorySheetOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            zIndex: 200,
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "440px",
              height: "100%",
              backgroundColor: "var(--bg-surface)",
              padding: "28px",
              display: "flex",
              flexDirection: "column",
              boxShadow: "-4px 0 20px rgba(0,0,0,0.15)",
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <h2 style={{ fontSize: "1.2rem", fontWeight: 600, margin: 0, color: "var(--text-ink)" }}>
                Add category
              </h2>
              <button
                type="button"
                onClick={() => setCategorySheetOpen(false)}
                className="btn-ghost"
                style={{ padding: "6px" }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddCategory} style={{ display: "flex", flexDirection: "column", gap: "14px", flex: 1 }}>
              <div>
                <label className="field-label" htmlFor="cat-name" style={{ fontSize: "0.8rem", marginBottom: "4px" }}>
                  Category name
                </label>
                <input
                  id="cat-name"
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  required
                  placeholder="e.g. Street lighting"
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    fontSize: "0.85rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border)",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label className="field-label" htmlFor="cat-desc" style={{ fontSize: "0.8rem", marginBottom: "4px" }}>
                  Description for residents
                </label>
                <textarea
                  id="cat-desc"
                  rows={3}
                  value={catDesc}
                  onChange={(e) => setCatDesc(e.target.value)}
                  required
                  placeholder="Describe what residents can report under this category…"
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    fontSize: "0.85rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border)",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Photo Evidence Rule selector */}
              <div>
                <label className="field-label" htmlFor="cat-photo-rule" style={{ fontSize: "0.8rem", marginBottom: "4px" }}>
                  Photo evidence rule
                </label>
                <select
                  id="cat-photo-rule"
                  value={catPhotoRule}
                  onChange={(e) => setCatPhotoRule(e.target.value as "required" | "recommended" | "optional")}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    fontSize: "0.85rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border)",
                    boxSizing: "border-box",
                  }}
                >
                  <option value="required">Required (Resident must attach photo or state safety reason)</option>
                  <option value="recommended">Recommended (Suggested for faster verification)</option>
                  <option value="optional">Optional (Not mandatory for submission)</option>
                </select>
              </div>

              <div>
                <label className="field-label" htmlFor="cat-hours" style={{ fontSize: "0.8rem", marginBottom: "4px" }}>
                  Target resolution time (hours)
                </label>
                <input
                  id="cat-hours"
                  type="number"
                  min={1}
                  value={catHours}
                  onChange={(e) => setCatHours(Number(e.target.value))}
                  required
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    fontSize: "0.85rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border)",
                    boxSizing: "border-box",
                  }}
                />
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "4px", display: "block" }}>
                  Approx {Math.max(1, Math.round(catHours / 24))} day{Math.round(catHours / 24) > 1 ? "s" : ""}
                </span>
              </div>

              <div>
                <label className="field-label" htmlFor="cat-team" style={{ fontSize: "0.8rem", marginBottom: "4px" }}>
                  Handling team (optional)
                </label>
                <select
                  id="cat-team"
                  value={catTeam}
                  onChange={(e) => setCatTeam(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    fontSize: "0.85rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border)",
                    boxSizing: "border-box",
                  }}
                >
                  <option value="">No default team</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginTop: "auto", display: "flex", gap: "10px", paddingTop: "16px" }}>
                <button
                  type="button"
                  onClick={() => setCategorySheetOpen(false)}
                  className="btn-secondary"
                  style={{ flex: 1, minHeight: "38px" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={catSubmitting}
                  className="btn-primary"
                  style={{ flex: 1, minHeight: "38px" }}
                >
                  {catSubmitting ? "Creating…" : "Create category"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Read-Only Complaint Modal Dialog */}
      {readOnlyComplaint && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            zIndex: 300,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
          onClick={() => setReadOnlyComplaint(null)}
        >
          <div
            style={{
              backgroundColor: "var(--bg-surface)",
              borderRadius: "var(--radius-md)",
              maxWidth: "560px",
              width: "100%",
              maxHeight: "85vh",
              overflowY: "auto",
              padding: "24px",
              boxShadow: "0 8px 30px rgba(0,0,0,0.18)",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span
                  style={{
                    fontFamily: "var(--font-mono, monospace)",
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "var(--text-muted)",
                  }}
                >
                  {readOnlyComplaint.tracking_id}
                </span>
                <StatusChip status={readOnlyComplaint.status} />
              </div>
              <button
                type="button"
                onClick={() => setReadOnlyComplaint(null)}
                className="btn-ghost"
                style={{ padding: "4px" }}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <h3 style={{ fontSize: "1.15rem", fontWeight: 600, color: "var(--text-ink)", margin: 0 }}>
              {readOnlyComplaint.title}
            </h3>

            <p style={{ fontSize: "0.875rem", lineHeight: 1.6, color: "var(--text-ink)", margin: 0 }}>
              {readOnlyComplaint.description}
            </p>

            <div
              style={{
                backgroundColor: "var(--bg-subtle)",
                borderRadius: "var(--radius-sm)",
                padding: "12px 14px",
                fontSize: "0.825rem",
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                color: "var(--text-muted)",
              }}
            >
              <div>
                <strong style={{ color: "var(--text-ink)" }}>Location:</strong>{" "}
                {readOnlyComplaint.location_text}
              </div>
              <div>
                <strong style={{ color: "var(--text-ink)" }}>Category:</strong>{" "}
                {readOnlyComplaint.category?.replace("_", " ")}
              </div>
              <div>
                <strong style={{ color: "var(--text-ink)" }}>Received:</strong>{" "}
                {formatDateTime(readOnlyComplaint.received_at)}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
              <button
                type="button"
                onClick={() => setReadOnlyComplaint(null)}
                className="btn-secondary"
                style={{ minHeight: "36px", padding: "0 16px" }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
