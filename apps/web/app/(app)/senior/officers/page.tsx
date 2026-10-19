"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search,
  ChevronLeft,
  ArrowUpDown,
  Loader2,
  Calendar,
  ExternalLink,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { PageContainer } from "../../../../components/Layout";
import { ReportRow, type ReportRowData } from "../../../../components/ReportRow";
import { getStoredAuth } from "../../../../lib/auth";
import { showToastError } from "../../../../lib/api";
import { formatDateTime, formatDate, formatPlural, formatDuration } from "../../../../lib/labels";

interface SeniorPerson {
  id: string;
  name: string;
  email: string;
  role: string;
  role_code: string;
  team_name: string | null;
  open_count: number;
  fixed_count: number;
  overdue_count: number;
  avg_fix_hours: number | null;
  last_active: string | null;
}

interface SeniorPersonDetail extends SeniorPerson {
  reports: Array<{
    id: string;
    tracking_id: string;
    title: string;
    status: string;
    category: string;
    location_text: string;
    area_name?: string;
    received_at: string;
    updated_at: string;
  }>;
}

type SortField = "name" | "role" | "team_name" | "open_count" | "fixed_count" | "overdue_count" | "avg_fix_hours" | "last_active";

export default function SeniorOfficersPage() {
  const auth = getStoredAuth();
  const searchParams = useSearchParams();
  const router = useRouter();

  const selectedPersonId = searchParams.get("id");
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d");
  const [search, setSearch] = useState("");
  const [people, setPeople] = useState<SeniorPerson[]>([]);
  const [personDetail, setPersonDetail] = useState<SeniorPersonDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [sortField, setSortField] = useState<SortField>("name");
  const [sortAsc, setSortAsc] = useState(true);

  const headers = useMemo(
    () => ({
      Authorization: `Bearer ${auth?.access_token}`,
    }),
    [auth]
  );

  const loadPeople = async () => {
    setLoading(true);
    try {
      const q = search.trim() ? `&search=${encodeURIComponent(search.trim())}` : "";
      const res = await fetch(`/api/v1/senior/people?period=${period}${q}`, { headers });
      if (res.ok) {
        setPeople(await res.json());
      } else {
        toast.error("Could not load officers list.");
      }
    } catch (err) {
      showToastError(err, "Could not load officers list.");
    } finally {
      setLoading(false);
    }
  };

  const loadPersonDetail = async (id: string) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/v1/senior/people/${encodeURIComponent(id)}?period=${period}`, {
        headers,
      });
      if (res.ok) {
        setPersonDetail(await res.json());
      } else {
        toast.error("Could not load person details.");
      }
    } catch (err) {
      showToastError(err, "Could not load person details.");
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    loadPeople();
  }, [period, search]);

  useEffect(() => {
    if (selectedPersonId) {
      loadPersonDetail(selectedPersonId);
    } else {
      setPersonDetail(null);
    }
  }, [selectedPersonId, period]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const sortedPeople = useMemo(() => {
    return [...people].sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];
      if (valA == null) return 1;
      if (valB == null) return -1;
      if (typeof valA === "string") valA = valA.toLowerCase();
      if (typeof valB === "string") valB = valB.toLowerCase();
      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [people, sortField, sortAsc]);

  // If viewing a single person's details
  if (selectedPersonId && personDetail) {
    return (
      <PageContainer>
        <div style={{ marginBottom: "20px" }}>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => router.push("/senior/officers")}
            style={{ padding: "4px 0", fontSize: "13px", display: "inline-flex", alignItems: "center", gap: "4px" }}
          >
            <ChevronLeft size={16} />
            <span>Back to officers</span>
          </button>
        </div>

        <div style={{ marginBottom: "24px" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: "0 0 4px" }}>
            {personDetail.name}
          </h1>
          <div style={{ fontSize: "13px", color: "var(--text-muted)", display: "flex", gap: "10px" }}>
            <span>{personDetail.role}</span>
            <span>·</span>
            <span>{personDetail.team_name || "General"}</span>
            <span>·</span>
            <span>{personDetail.email}</span>
          </div>
        </div>

        {/* Their numbers on one line */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            backgroundColor: "var(--bg-surface)",
            overflow: "hidden",
            marginBottom: "24px",
          }}
        >
          <div style={{ padding: "16px 20px" }}>
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Open reports</span>
            <div style={{ fontSize: "1.5rem", fontWeight: 600, color: "var(--text-ink)", margin: "4px 0" }}>
              {personDetail.open_count}
            </div>
          </div>
          <div style={{ padding: "16px 20px", borderLeft: "1px solid var(--border)" }}>
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Fixed in period</span>
            <div style={{ fontSize: "1.5rem", fontWeight: 600, color: "var(--text-ink)", margin: "4px 0" }}>
              {personDetail.fixed_count}
            </div>
          </div>
          <div style={{ padding: "16px 20px", borderLeft: "1px solid var(--border)" }}>
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Overdue</span>
            <div
              style={{
                fontSize: "1.5rem",
                fontWeight: 600,
                color: personDetail.overdue_count > 0 ? "var(--priority-high)" : "var(--text-ink)",
                margin: "4px 0",
              }}
            >
              {personDetail.overdue_count}
            </div>
          </div>
          <div style={{ padding: "16px 20px", borderLeft: "1px solid var(--border)" }}>
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Average time to fix</span>
            <div style={{ fontSize: "1.5rem", fontWeight: 600, color: "var(--text-ink)", margin: "4px 0" }}>
              {personDetail.avg_fix_hours != null ? `${personDetail.avg_fix_hours} hrs` : "–"}
            </div>
          </div>
        </div>

        {/* Reports list (open first), each a normal row, read only */}
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            backgroundColor: "var(--bg-surface)",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
            <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>
              Reports ({personDetail.reports.length})
            </h2>
          </div>

          <div>
            {personDetail.reports.length === 0 ? (
              <div style={{ padding: "32px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
                No reports assigned to this person.
              </div>
            ) : (
              personDetail.reports.map((r) => {
                const rowData: ReportRowData = {
                  id: r.id,
                  tracking_id: r.tracking_id,
                  title: r.title,
                  status: r.status as any,
                  category: r.category,
                  location_text: r.location_text,
                  area_name: r.area_name,
                  received_at: r.received_at,
                  dueText: undefined,
                };
                return (
                  <ReportRow
                    key={r.id}
                    report={rowData}
                    onSelect={() => router.push(`/senior/reports?id=${r.tracking_id}`)}
                  />
                );
              })
            )}
          </div>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      {/* Page Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "var(--text-ink)",
              margin: 0,
              letterSpacing: "-0.01em",
            }}
          >
            Officers
          </h1>
        </div>

        {/* Period Selector & Search */}
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <div style={{ position: "relative" }}>
            <Search
              size={14}
              style={{
                position: "absolute",
                left: 10,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)",
              }}
            />
            <input
              type="search"
              placeholder="Search staff"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                padding: "6px 10px 6px 30px",
                fontSize: "13px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border)",
              }}
            />
          </div>

          <div
            style={{
              display: "inline-flex",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              overflow: "hidden",
            }}
          >
            {(["7d", "30d", "90d"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                style={{
                  padding: "6px 12px",
                  fontSize: "12px",
                  fontWeight: period === p ? 600 : 400,
                  backgroundColor: period === p ? "var(--primary)" : "var(--bg-surface)",
                  color: period === p ? "#ffffff" : "var(--text-ink)",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Officers & Field Workers Table */}
      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          backgroundColor: "var(--bg-surface)",
          overflow: "hidden",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-muted)", textAlign: "left" }}>
                <th
                  onClick={() => handleSort("name")}
                  style={{ padding: "10px 14px", fontWeight: 600, cursor: "pointer" }}
                >
                  Name
                </th>
                <th
                  onClick={() => handleSort("role")}
                  style={{ padding: "10px 14px", fontWeight: 600, cursor: "pointer" }}
                >
                  Role
                </th>
                <th
                  onClick={() => handleSort("team_name")}
                  style={{ padding: "10px 14px", fontWeight: 600, cursor: "pointer" }}
                >
                  Team
                </th>
                <th
                  onClick={() => handleSort("open_count")}
                  style={{ padding: "10px 14px", fontWeight: 600, textAlign: "right", cursor: "pointer" }}
                >
                  Open
                </th>
                <th
                  onClick={() => handleSort("fixed_count")}
                  style={{ padding: "10px 14px", fontWeight: 600, textAlign: "right", cursor: "pointer" }}
                >
                  Fixed
                </th>
                <th
                  onClick={() => handleSort("overdue_count")}
                  style={{ padding: "10px 14px", fontWeight: 600, textAlign: "right", cursor: "pointer" }}
                >
                  Overdue
                </th>
                <th
                  onClick={() => handleSort("avg_fix_hours")}
                  style={{ padding: "10px 14px", fontWeight: 600, textAlign: "right", cursor: "pointer" }}
                >
                  Avg time to fix
                </th>
                <th
                  onClick={() => handleSort("last_active")}
                  style={{ padding: "10px 14px", fontWeight: 600, textAlign: "right", cursor: "pointer" }}
                >
                  Last active
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ padding: "32px", textAlign: "center" }}>
                    <Loader2 size={20} className="spin" style={{ margin: "0 auto" }} />
                  </td>
                </tr>
              ) : sortedPeople.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: "32px", textAlign: "center", color: "var(--text-muted)" }}>
                    No officers or field workers found.
                  </td>
                </tr>
              ) : (
                sortedPeople.map((person) => (
                  <tr
                    key={person.id}
                    onClick={() => router.push(`/senior/officers?id=${person.id}`)}
                    style={{ borderBottom: "1px solid var(--border)", cursor: "pointer" }}
                    className="report-row-item"
                  >
                    <td style={{ padding: "10px 14px", fontWeight: 600, color: "var(--text-ink)" }}>
                      {person.name}
                    </td>
                    <td style={{ padding: "10px 14px", color: "var(--text-muted)" }}>
                      {person.role}
                    </td>
                    <td style={{ padding: "10px 14px", color: "var(--text-muted)" }}>
                      {person.team_name || "–"}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {person.open_count}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {person.fixed_count}
                    </td>
                    <td
                      style={{
                        padding: "10px 14px",
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                        fontWeight: person.overdue_count > 0 ? 600 : 400,
                        color: person.overdue_count > 0 ? "var(--priority-high)" : "var(--text-muted)",
                      }}
                    >
                      {person.overdue_count}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {person.avg_fix_hours != null ? `${person.avg_fix_hours} hrs` : "–"}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                      {person.last_active ? formatDate(person.last_active) : "–"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </PageContainer>
  );
}
