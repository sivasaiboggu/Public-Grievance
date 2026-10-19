"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search,
  ChevronLeft,
  Filter,
  X,
  MapPin,
  ExternalLink,
  Copy,
  Check,
  Loader2,
  Calendar,
  Clock,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { PageContainer } from "../../../../components/Layout";
import { PhotoGallery } from "../../../../components/PhotoGallery";
import { StatusChip } from "../../../../components/StatusChip";
import { ReportRow, type ReportRowData } from "../../../../components/ReportRow";
import { getStoredAuth } from "../../../../lib/auth";
import { showToastError } from "../../../../lib/api";
import {
  PLAIN_STATUS_LABELS,
  formatDateTime,
  formatDate,
  formatPlural,
  getReportSLAInfo,
} from "../../../../lib/labels";

interface ReportItem {
  id: string;
  tracking_id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  location_text: string;
  area_name?: string;
  latitude: number;
  longitude: number;
  received_at: string;
  updated_at: string;
}

interface ReportDetail extends ReportItem {
  events: Array<{ id: string; status: string; note: string; created_at: string }>;
  evidence: Array<{
    id: string;
    media_type: string;
    size_bytes: number;
    uploaded_at: string;
    phase?: "report" | "before" | "after";
    signed_url?: string;
  }>;
}

export default function SeniorReportsPage() {
  const auth = getStoredAuth();
  const searchParams = useSearchParams();
  const router = useRouter();

  const selectedTrackingId = searchParams.get("id");

  // Filter and search states
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "");
  const [categoryFilter, setCategoryFilter] = useState(searchParams.get("category") || "");
  const [overdueOnly, setOverdueOnly] = useState(searchParams.get("overdue") === "true");
  const [pageOffset, setPageOffset] = useState(0);

  const [reports, setReports] = useState<ReportItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedReport, setSelectedReport] = useState<ReportDetail | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const headers = useMemo(
    () => ({
      Authorization: `Bearer ${auth?.access_token}`,
    }),
    [auth]
  );

  const loadReports = async () => {
    setLoadingList(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (categoryFilter) params.set("category", categoryFilter);
      if (overdueOnly) params.set("overdue", "true");
      if (search.trim()) params.set("search", search.trim());
      params.set("offset", String(pageOffset));
      params.set("limit", "25");

      const res = await fetch(`/api/v1/senior/reports?${params.toString()}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setReports(data.items || []);
        setTotalCount(data.total || 0);
      } else {
        toast.error("Could not load reports list.");
      }
    } catch (err) {
      showToastError(err, "Could not load reports list.");
    } finally {
      setLoadingList(false);
    }
  };

  const loadReportDetail = async (trackingId: string) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/v1/complaints/${encodeURIComponent(trackingId)}`, { headers });
      if (res.ok) {
        setSelectedReport(await res.json());
      } else {
        toast.error("Could not load report details.");
      }
    } catch (err) {
      showToastError(err, "Could not load report details.");
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, [statusFilter, categoryFilter, overdueOnly, search, pageOffset]);

  useEffect(() => {
    if (selectedTrackingId) {
      loadReportDetail(selectedTrackingId);
    } else {
      setSelectedReport(null);
    }
  }, [selectedTrackingId]);

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    toast.success(`Copied ${code}`);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // If a report is selected, show read-only report view
  if (selectedTrackingId && selectedReport) {
    return (
      <PageContainer>
        <div style={{ marginBottom: "20px" }}>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => router.push("/senior/reports")}
            style={{ padding: "4px 0", fontSize: "13px", display: "inline-flex", alignItems: "center", gap: "4px" }}
          >
            <ChevronLeft size={16} />
            <span>Back to reports</span>
          </button>
        </div>

        {/* Quiet read-only line */}
        <div
          style={{
            padding: "8px 14px",
            backgroundColor: "var(--bg-subtle)",
            borderRadius: "var(--radius-sm)",
            fontSize: "12px",
            color: "var(--text-muted)",
            marginBottom: "16px",
          }}
        >
          You can view this report. Officers update it.
        </div>

        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            backgroundColor: "var(--bg-surface)",
            padding: "24px",
            display: "flex",
            flexDirection: "column",
            gap: "24px",
          }}
        >
          {/* Header block */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <span
                  style={{
                    fontFamily: "var(--font-mono, monospace)",
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "var(--text-muted)",
                  }}
                >
                  {selectedReport.tracking_id}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopyCode(selectedReport.tracking_id)}
                  title="Copy reference code"
                  style={{ background: "none", border: "none", cursor: "pointer", padding: "2px" }}
                >
                  {copiedCode ? <Check size={14} color="var(--success)" /> : <Copy size={14} color="var(--text-muted)" />}
                </button>
              </div>
              <StatusChip status={selectedReport.status as any} />
            </div>

            <h1
              style={{
                fontSize: "1.35rem",
                fontWeight: 700,
                color: "var(--text-ink)",
                margin: "0 0 8px",
                lineHeight: 1.35,
              }}
            >
              {selectedReport.title}
            </h1>

            <div style={{ fontSize: "13px", color: "var(--text-muted)", display: "flex", flexWrap: "wrap", gap: "8px" }}>
              <span>{selectedReport.category.replace("_", " ")}</span>
              <span>·</span>
              <span>{selectedReport.area_name || selectedReport.location_text}</span>
              <span>·</span>
              <span>Received {formatDateTime(selectedReport.received_at)}</span>
            </div>
          </div>

          {/* Progress Strip */}
          <div
            style={{
              backgroundColor: "var(--bg-subtle)",
              borderRadius: "var(--radius-sm)",
              padding: "12px 16px",
            }}
          >
            {selectedReport.status === "rejected" ? (
              <div style={{ color: "var(--text-muted)", fontSize: "13px", fontWeight: 500 }}>
                Report not accepted
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", textAlign: "center" }}>
                {[
                  { key: "submitted", label: "Received", step: 1 },
                  { key: "under_review", label: "Being reviewed", step: 2 },
                  { key: "in_progress", label: "Work started", step: 3 },
                  { key: "resolved", label: "Fixed", step: 4 },
                ].map((s) => {
                  const currentIdx =
                    selectedReport.status === "submitted"
                      ? 1
                      : selectedReport.status === "under_review"
                      ? 2
                      : selectedReport.status === "in_progress"
                      ? 3
                      : selectedReport.status === "resolved"
                      ? 4
                      : 0;
                  const isFilled = s.step <= currentIdx;
                  return (
                    <div key={s.key}>
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
                          fontWeight: s.step === currentIdx ? 600 : 400,
                          color: isFilled ? "var(--text-ink)" : "var(--text-muted)",
                        }}
                      >
                        {s.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* What the resident wrote */}
          <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "18px" }}>
            <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-muted)", margin: "0 0 8px" }}>
              What the resident wrote
            </h2>
            <p style={{ fontSize: "14px", lineHeight: 1.6, color: "var(--text-ink)", margin: 0 }}>
              {selectedReport.description}
            </p>
          </div>

          {/* Photos (Gallery & Before/After Slider) */}
          {selectedReport.evidence && selectedReport.evidence.length > 0 && (
            <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "18px" }}>
              <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-muted)", margin: "0 0 10px" }}>
                Photos
              </h2>
              <PhotoGallery trackingId={selectedReport.tracking_id} evidence={selectedReport.evidence} />
            </div>
          )}

          {/* Location */}
          <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "18px" }}>
            <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-muted)", margin: "0 0 8px" }}>
              Location
            </h2>
            <div style={{ display: "flex", alignItems: "baseline", gap: "6px", marginBottom: "4px" }}>
              <MapPin size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
              <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-ink)" }}>
                {selectedReport.location_text}
              </span>
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)", display: "flex", gap: "8px", alignItems: "center" }}>
              <span>
                {selectedReport.latitude.toFixed(4)}° N, {selectedReport.longitude.toFixed(4)}° E
              </span>
              <span>·</span>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${selectedReport.latitude},${selectedReport.longitude}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: "var(--primary)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "3px" }}
              >
                <span>Open in Maps</span>
                <ExternalLink size={12} />
              </a>
            </div>
          </div>

          {/* Updates Timeline */}
          <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "18px" }}>
            <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-muted)", margin: "0 0 12px" }}>
              Updates
            </h2>
            {selectedReport.events && selectedReport.events.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {selectedReport.events.map((ev) => (
                  <div key={ev.id} style={{ display: "flex", gap: "10px", fontSize: "13px" }}>
                    <span style={{ color: "var(--text-muted)", fontSize: "12px", whiteSpace: "nowrap" }}>
                      {formatDateTime(ev.created_at)}
                    </span>
                    <div>
                      <span style={{ fontWeight: 600, marginRight: "6px" }}>
                        {(PLAIN_STATUS_LABELS as Record<string, string>)[ev.status] || ev.status}:
                      </span>
                      <span style={{ color: "var(--text-ink)" }}>{ev.note}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                Report received.
              </div>
            )}
          </div>
        </div>
      </PageContainer>
    );
  }

  // List View
  return (
    <PageContainer>
      {/* Title */}
      <div style={{ marginBottom: "20px" }}>
        <h1
          style={{
            fontSize: "1.5rem",
            fontWeight: 700,
            color: "var(--text-ink)",
            margin: "0 0 4px",
            letterSpacing: "-0.01em",
          }}
        >
          Reports
        </h1>
      </div>

      {/* Search and Filters Bar */}
      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          backgroundColor: "var(--bg-surface)",
          padding: "16px",
          marginBottom: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", flex: 1, minWidth: "220px" }}>
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
              placeholder="Search reports"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "7px 10px 7px 30px",
                fontSize: "13px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border)",
                boxSizing: "border-box",
              }}
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ padding: "7px 10px", fontSize: "13px" }}
          >
            <option value="">All statuses</option>
            <option value="submitted">Received</option>
            <option value="under_review">Being reviewed</option>
            <option value="in_progress">Work started</option>
            <option value="resolved">Fixed</option>
            <option value="rejected">Not accepted</option>
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{ padding: "7px 10px", fontSize: "13px" }}
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

          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(e) => setOverdueOnly(e.target.checked)}
            />
            <span>Overdue only</span>
          </label>
        </div>

        <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
          {formatPlural(totalCount, "report")}
        </div>
      </div>

      {/* Reports List */}
      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          backgroundColor: "var(--bg-surface)",
          overflow: "hidden",
        }}
      >
        {loadingList ? (
          <div style={{ padding: "20px" }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <div key={n} className="skeleton" style={{ height: "64px", marginBottom: "8px", borderRadius: "var(--radius-sm)" }} />
            ))}
          </div>
        ) : reports.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
            No reports match. Clear filters.
          </div>
        ) : (
          reports.map((r) => {
            const sla = getReportSLAInfo(r.received_at, r.status, r.category);
            const rowData: ReportRowData = {
              id: r.id,
              tracking_id: r.tracking_id,
              title: r.title,
              status: r.status as any,
              category: r.category,
              location_text: r.location_text,
              area_name: r.area_name,
              received_at: r.received_at,
              isOverdue: sla.isOverdue,
              dueText: sla.text,
              clusterCount: (r as any).cluster_count,
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

      {/* Pagination controls */}
      {totalCount > 25 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "16px" }}>
          <button
            type="button"
            className="btn-secondary"
            disabled={pageOffset === 0}
            onClick={() => setPageOffset(Math.max(0, pageOffset - 25))}
            style={{ fontSize: "13px", padding: "6px 14px" }}
          >
            Previous
          </button>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            Showing {pageOffset + 1}–{Math.min(pageOffset + 25, totalCount)} of {totalCount}
          </span>
          <button
            type="button"
            className="btn-secondary"
            disabled={pageOffset + 25 >= totalCount}
            onClick={() => setPageOffset(pageOffset + 25)}
            style={{ fontSize: "13px", padding: "6px 14px" }}
          >
            Next
          </button>
        </div>
      )}
    </PageContainer>
  );
}
