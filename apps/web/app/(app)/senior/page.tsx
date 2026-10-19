"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart2,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileSpreadsheet,
  MapPin,
  Printer,
  RefreshCw,
  Table as TableIcon,
  Users,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { displayName } from "@grievancegrid/api-client";
import { PageContainer } from "../../../components/Layout";
import { SeniorClusterMap } from "../../../components/SeniorClusterMap";
import { StatusChip } from "../../../components/StatusChip";
import { getStoredAuth } from "../../../lib/auth";
import { showToastError } from "../../../lib/api";
import {
  formatDate,
  formatDateTime,
  formatDuration,
  formatPlural,
} from "../../../lib/labels";

interface SummaryMetric {
  value: number;
  change?: number;
  change_text?: string;
}

interface SeniorMetricsResponse {
  period: string;
  area_name: string;
  summary: {
    received: SummaryMetric;
    fixed: SummaryMetric;
    overdue: SummaryMetric;
    avg_fix_hours: SummaryMetric;
  };
  daily_counts: Array<{ date: string; full_date: string; reports: number }>;
  category_breakdown: Array<{ category: string; code?: string; count: number; target_days?: number }>;
  ontime_breakdown: Array<{
    category: string;
    code?: string;
    fixed_on_time: number;
    fixed_late: number;
    target_days?: number;
  }>;
  hotspots: Array<{ location: string; area_name?: string; count: number; latitude: number; longitude: number }>;
  teams_stats: Array<{
    id?: string;
    name: string;
    open: number;
    fixed: number;
    overdue: number;
    avg_time: string;
  }>;
  oldest_reports: Array<{
    id: string;
    tracking_id: string;
    title: string;
    category: string;
    status: string;
    area_name?: string;
    location_text: string;
    received_at: string;
    days_open: number;
    days_overdue: number;
  }>;
}

function getTimeAwareGreeting(name: string): string {
  const hour = new Date().getHours();
  let greeting = "Good morning";
  if (hour >= 12 && hour < 17) {
    greeting = "Good afternoon";
  } else if (hour >= 17) {
    greeting = "Good evening";
  }
  return `${greeting}, ${name || "Authority"}`;
}

export default function SeniorDashboardPage() {
  const auth = getStoredAuth();
  const [periodDays, setPeriodDays] = useState<number>(30);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SeniorMetricsResponse | null>(null);
  const [showTableFallback, setShowTableFallback] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [selectedTeamFilter, setSelectedTeamFilter] = useState<string | null>(null);
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [remindedIds, setRemindedIds] = useState<Set<string>>(new Set());

  const fetchMetrics = async (days: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/metrics/overview?days=${days}`, {
        headers: {
          Authorization: `Bearer ${auth?.access_token}`,
        },
      });
      if (res.ok) {
        const metricsData = await res.json();
        setData(metricsData);
      } else {
        toast.error("Could not load dashboard metrics.");
      }
    } catch (err) {
      showToastError(err, "Could not load dashboard metrics.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics(periodDays);
  }, [periodDays]);

  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  const handleExportCsv = async () => {
    try {
      const periodParam = periodDays === 7 ? "7d" : periodDays === 90 ? "90d" : "30d";
      const res = await fetch(`/api/v1/metrics/export?period=${periodParam}`, {
        headers: {
          Authorization: `Bearer ${auth?.access_token}`,
        },
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `grievancegrid-report-${periodParam}-${new Date().toISOString().split("T")[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast.success("CSV report downloaded.");
      } else {
        toast.error("Could not export CSV report.");
      }
    } catch (err) {
      showToastError(err, "Could not export CSV report.");
    }
  };

  // Date range calculation for human summary sentence
  const periodDateRange = useMemo(() => {
    const end = new Date();
    const start = new Date(end.getTime() - periodDays * 24 * 60 * 60 * 1000);
    const startFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" })
      .format(start)
      .replace(/Sept\.?/i, "Sep");
    const endFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" })
      .format(end)
      .replace(/Sept\.?/i, "Sep");
    return { startFmt, endFmt };
  }, [periodDays]);

  // Needs attention items computed from real data with humane wording
  const attentionItems = useMemo(() => {
    if (!data) return [];
    const items: Array<{ text: string; link?: string }> = [];

    // Check overdue reports
    const overdueCount = data.summary?.overdue?.value || 0;
    if (overdueCount > 0) {
      items.push({
        text: `${overdueCount} ${overdueCount === 1 ? "report is" : "reports are"} past their due date.`,
      });
    }

    // Check if any team has high open backlog
    if (data.teams_stats) {
      data.teams_stats.forEach((t) => {
        if (t.overdue > 2) {
          items.push({
            text: `${t.name} team has ${t.overdue} overdue jobs.`,
          });
        }
      });
    }

    // Check oldest reports
    if (data.oldest_reports && data.oldest_reports.length > 0) {
      const oldest = data.oldest_reports[0];
      if (oldest.days_open > 30) {
        items.push({
          text: `The oldest, ${oldest.tracking_id}, has waited ${oldest.days_open} days.`,
        });
      }
    }

    return items.slice(0, 5);
  }, [data]);

  // Sort and merge categories for horizontal bar chart
  const sortedCategories = useMemo(() => {
    if (!data?.category_breakdown) return [];
    const merged: Record<string, { category: string; count: number }> = {};
    data.category_breakdown.forEach((item) => {
      let key = item.category;
      if (key.toLowerCase().includes("street light") || key.toLowerCase().includes("street lighting")) {
        key = "Street light";
      } else if (key.toLowerCase().includes("manhole") || key.toLowerCase().includes("drain")) {
        key = "Manhole or open drain";
      } else if (key.toLowerCase().includes("pothole") || key.toLowerCase().includes("road damage")) {
        key = "Road damage";
      }
      if (!merged[key]) {
        merged[key] = { category: key, count: 0 };
      }
      merged[key].count += item.count;
    });
    return Object.values(merged).sort((a, b) => b.count - a.count);
  }, [data]);

  // Compute 7-day rolling average for daily reports chart
  const dailyCountsWithAvg = useMemo(() => {
    if (!data?.daily_counts) return [];
    return data.daily_counts.map((item, idx, arr) => {
      const windowStart = Math.max(0, idx - 6);
      const windowSlice = arr.slice(windowStart, idx + 1);
      const sum = windowSlice.reduce((acc, curr) => acc + curr.reports, 0);
      const avg = Math.round((sum / windowSlice.length) * 10) / 10;
      return {
        ...item,
        rolling_avg: avg,
      };
    });
  }, [data]);

  const maxHotspotCount = useMemo(() => {
    if (!data?.hotspots || data.hotspots.length === 0) return 1;
    return Math.max(...data.hotspots.map((h) => h.count), 1);
  }, [data]);

  const onTimeMetrics = useMemo(() => {
    if (!data?.ontime_breakdown) return { totalOnTime: 0, totalFixed: 0, pct: 100 };
    const totalOnTime = data.ontime_breakdown.reduce((acc, c) => acc + c.fixed_on_time, 0);
    const totalLate = data.ontime_breakdown.reduce((acc, c) => acc + c.fixed_late, 0);
    const totalFixed = totalOnTime + totalLate;
    const pct = totalFixed > 0 ? Math.round((totalOnTime / totalFixed) * 100) : 100;
    return { totalOnTime, totalFixed, pct };
  }, [data]);

  const userName = auth?.user?.name ? displayName(auth.user.name) : "Authority";

  return (
    <PageContainer>
      {/* Print Stylesheet */}
      <style>{`
        @media print {
          nav, header, footer, .no-print, button, .period-controls {
            display: none !important;
          }
          body, .page-container {
            padding: 0 !important;
            margin: 0 !important;
            max-width: 100% !important;
            font-size: 11pt !important;
            color: #000 !important;
            background: #fff !important;
          }
          .recharts-wrapper {
            max-width: 100% !important;
          }
        }
      `}</style>

      {/* 1. Header: Time-aware greeting & plain human summary sentence */}
      <div
        style={{
          borderBottom: "1px solid var(--border)",
          paddingBottom: "16px",
          marginBottom: "20px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div>
            <h1
              style={{
                fontSize: "1.5rem",
                fontWeight: 600,
                color: "var(--text-ink)",
                margin: 0,
                letterSpacing: "-0.01em",
              }}
            >
              {getTimeAwareGreeting(userName)}
            </h1>

            {data && (
              <p
                style={{
                  margin: "6px 0 0",
                  color: "var(--text-muted)",
                  fontSize: "0.9rem",
                  lineHeight: 1.5,
                }}
              >
                Since {periodDateRange.startFmt}, {data.summary.received.value} reports came in and{" "}
                {data.summary.fixed.value} were fixed.{" "}
                {data.summary.overdue.value > 0
                  ? `${data.summary.overdue.value} are past their due date.`
                  : "All open reports are within due date."}
              </p>
            )}
          </div>

          {/* Controls: Period, Refresh, Export */}
          <div
            className="no-print period-controls"
            style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}
          >
            {/* Period selector */}
            <div
              style={{
                display: "inline-flex",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "var(--bg-surface)",
                overflow: "hidden",
              }}
            >
              {[7, 30, 90].map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setPeriodDays(days)}
                  style={{
                    padding: "6px 12px",
                    fontSize: "0.8rem",
                    fontWeight: periodDays === days ? 600 : 400,
                    border: "none",
                    background: periodDays === days ? "var(--bg-subtle)" : "transparent",
                    color: periodDays === days ? "var(--primary)" : "var(--text-muted)",
                    cursor: "pointer",
                  }}
                >
                  {days} days
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => fetchMetrics(periodDays)}
              disabled={loading}
              className="btn-secondary"
              style={{ minHeight: "34px", padding: "0 10px", fontSize: "0.8rem" }}
              title="Refresh numbers"
            >
              <RefreshCw size={13} className={loading ? "spin" : ""} />
              <span>Refresh</span>
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              className="btn-secondary"
              style={{ minHeight: "34px", padding: "0 10px", fontSize: "0.8rem" }}
              title="Download CSV"
            >
              <Download size={13} />
              <span>Export CSV</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="btn-secondary"
              style={{ minHeight: "34px", padding: "0 10px", fontSize: "0.8rem" }}
              title="Print summary"
            >
              <Printer size={13} />
              <span>Print</span>
            </button>
          </div>
        </div>
      </div>

      {loading && !data ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div className="skeleton" style={{ height: "100px", borderRadius: "var(--radius-md)" }} />
          <div className="skeleton" style={{ height: "260px", borderRadius: "var(--radius-md)" }} />
          <div className="skeleton" style={{ height: "200px", borderRadius: "var(--radius-md)" }} />
        </div>
      ) : data ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* 2. Needs Attention first (only if data supports it) */}
          {attentionItems.length > 0 && (
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                padding: "14px 18px",
                backgroundColor: "var(--bg-subtle)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  color: "var(--text-ink)",
                  marginBottom: "8px",
                }}
              >
                <AlertTriangle size={15} color="var(--priority-high, #C2540A)" />
                <span>Needs attention</span>
              </div>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: "18px",
                  fontSize: "0.825rem",
                  color: "var(--text-ink)",
                  lineHeight: 1.6,
                }}
              >
                {attentionItems.map((item, idx) => (
                  <li key={idx}>{item.text}</li>
                ))}
              </ul>
            </div>
          )}

          {/* 3. Four numbers in one row separated by vertical hairlines */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--bg-surface)",
              overflow: "hidden",
            }}
            className="metrics-summary-row"
          >
            {/* Number 1: Received */}
            <div style={{ padding: "18px 20px" }}>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 500 }}>
                Reports received
              </span>
              <div
                style={{
                  fontSize: "1.75rem",
                  fontWeight: 600,
                  color: "var(--text-ink)",
                  margin: "4px 0",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {data.summary.received.value}
              </div>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                {data.summary.received.change != null && (
                  <span>
                    {data.summary.received.change >= 0
                      ? `${data.summary.received.change} more than the ${periodDays} days before`
                      : `${Math.abs(data.summary.received.change)} fewer than the ${periodDays} days before`}
                  </span>
                )}
              </span>
            </div>

            {/* Number 2: Fixed */}
            <div style={{ padding: "18px 20px", borderLeft: "1px solid var(--border)" }}>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 500 }}>
                Fixed
              </span>
              <div
                style={{
                  fontSize: "1.75rem",
                  fontWeight: 600,
                  color: "var(--text-ink)",
                  margin: "4px 0",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {data.summary.fixed.value}
              </div>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                {data.summary.fixed.change != null && (
                  <span>
                    {data.summary.fixed.change >= 0
                      ? `${data.summary.fixed.change} more than the ${periodDays} days before`
                      : `${Math.abs(data.summary.fixed.change)} fewer than the ${periodDays} days before`}
                  </span>
                )}
              </span>
            </div>

            {/* Number 3: Overdue */}
            <div style={{ padding: "18px 20px", borderLeft: "1px solid var(--border)" }}>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 500 }}>
                Overdue
              </span>
              <div
                style={{
                  fontSize: "1.75rem",
                  fontWeight: 600,
                  color: data.summary.overdue.value > 0 ? "var(--priority-high, #C2540A)" : "var(--text-ink)",
                  margin: "4px 0",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {data.summary.overdue.value}
              </div>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                {data.summary.overdue.value === 0
                  ? "All open reports are on time"
                  : `${data.summary.overdue.value} past their due date`}
              </span>
            </div>

            {/* Number 4: Average time to fix */}
            <div style={{ padding: "18px 20px", borderLeft: "1px solid var(--border)" }}>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 500 }}>
                Average time to fix
              </span>
              <div
                style={{
                  fontSize: "1.75rem",
                  fontWeight: 600,
                  color: "var(--text-ink)",
                  margin: "4px 0",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {formatDuration(data.summary.avg_fix_hours.value)}
              </div>
            </div>

            {/* Number 5: Answered on time */}
            <div style={{ padding: "18px 20px", borderLeft: "1px solid var(--border)" }}>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 500 }}>
                Answered on time
              </span>
              <div
                style={{
                  fontSize: "1.75rem",
                  fontWeight: 600,
                  color: "var(--text-ink)",
                  margin: "4px 0",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {onTimeMetrics.pct}%
              </div>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                {onTimeMetrics.totalOnTime} of {onTimeMetrics.totalFixed} within SLA
              </span>
            </div>
          </div>

          {/* 4. Charts side by side */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "20px",
            }}
            className="senior-charts-grid"
          >
            {/* Chart 1: New reports each day */}
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                backgroundColor: "var(--bg-surface)",
                padding: "18px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  marginBottom: "14px",
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                  <h3 style={{ fontSize: "0.95rem", fontWeight: 600, margin: 0, color: "var(--text-ink)" }}>
                    New reports each day
                  </h3>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    last {periodDays} days
                  </span>
                </div>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setShowTableFallback(!showTableFallback)}
                  style={{ fontSize: "0.75rem", padding: "2px 6px" }}
                >
                  <TableIcon size={13} />
                  <span>{showTableFallback ? "Show chart" : "Show table"}</span>
                </button>
              </div>

              {showTableFallback ? (
                <div style={{ maxHeight: "240px", overflowY: "auto", fontSize: "0.8rem" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                        <th style={{ padding: "6px" }}>Date</th>
                        <th style={{ padding: "6px", textAlign: "right" }}>Reports</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.daily_counts.map((d, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "6px" }}>{d.full_date || d.date}</td>
                          <td style={{ padding: "6px", textAlign: "right" }}>{d.reports}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ width: "100%", height: "240px" }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyCountsWithAvg} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis
                        dataKey="date"
                        stroke="var(--text-muted)"
                        fontSize={11}
                        tickLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "var(--bg-surface)",
                          borderColor: "var(--border)",
                          borderRadius: "var(--radius-sm)",
                          fontSize: "0.8rem",
                        }}
                      />
                      <Bar
                        dataKey="reports"
                        name="Reports"
                        fill="#93c5fd"
                        barSize={8}
                        radius={[2, 2, 0, 0]}
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="rolling_avg"
                        name="7-day average"
                        stroke="#1d4ed8"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Chart 2: Reports by category */}
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                backgroundColor: "var(--bg-surface)",
                padding: "18px",
              }}
            >
              <div style={{ marginBottom: "14px" }}>
                <h3 style={{ fontSize: "0.95rem", fontWeight: 600, margin: 0, color: "var(--text-ink)" }}>
                  Reports by category
                </h3>
              </div>

              <div style={{ width: "100%", height: "240px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={sortedCategories}
                    margin={{ top: 5, right: 25, left: 15, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                    <XAxis type="number" stroke="var(--text-muted)" fontSize={11} tickLine={false} allowDecimals={false} />
                    <YAxis
                      dataKey="category"
                      type="category"
                      stroke="var(--text-ink)"
                      fontSize={11}
                      tickLine={false}
                      width={130}
                      interval={0}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--bg-surface)",
                        borderColor: "var(--border)",
                        borderRadius: "var(--radius-sm)",
                        fontSize: "0.8rem",
                      }}
                    />
                    <Bar dataKey="count" name="Reports" fill="#1d4ed8" radius={[0, 4, 4, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* 5. Fixed on time (Stacked bar per category: on-time vs late) */}
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--bg-surface)",
              padding: "18px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "14px",
              }}
            >
              <h3 style={{ fontSize: "0.95rem", fontWeight: 600, margin: 0, color: "var(--text-ink)" }}>
                Fixed on time
              </h3>
              <div style={{ display: "flex", gap: "14px", fontSize: "12px", color: "var(--text-muted)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                  <div style={{ width: "10px", height: "10px", backgroundColor: "#1e7a4c", borderRadius: "2px" }} />
                  <span>On time</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                  <div style={{ width: "10px", height: "10px", backgroundColor: "#c2540a", borderRadius: "2px" }} />
                  <span>Late</span>
                </div>
              </div>
            </div>

            <div style={{ width: "100%", height: "240px" }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.ontime_breakdown}
                  margin={{ top: 10, right: 20, left: -10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="category" stroke="var(--text-muted)" fontSize={11} tickLine={false} interval={0} />
                  <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border)",
                      borderRadius: "var(--radius-sm)",
                      fontSize: "0.8rem",
                    }}
                  />
                  <Bar
                    dataKey="fixed_on_time"
                    name="On time"
                    stackId="a"
                    fill="#1e7a4c"
                    radius={[0, 0, 0, 0]}
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="fixed_late"
                    name="Late"
                    stackId="a"
                    fill="#c2540a"
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 5. Incident Clusters & Density Bubble Map */}
          <SeniorClusterMap />

          {/* 6. Where most open reports are (Ranked list by Ward name with thin bar) */}
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--bg-surface)",
              padding: "18px",
            }}
          >
            <div style={{ marginBottom: "14px" }}>
              <h3 style={{ fontSize: "0.95rem", fontWeight: 600, margin: 0, color: "var(--text-ink)" }}>
                Where most open reports are
              </h3>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {data.hotspots.map((h, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                  <span
                    style={{
                      width: "150px",
                      fontSize: "13px",
                      fontWeight: 500,
                      color: "var(--text-ink)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={h.area_name || h.location}
                  >
                    {h.area_name || h.location}
                  </span>
                  <div
                    style={{
                      flex: 1,
                      height: "6px",
                      backgroundColor: "var(--bg-subtle)",
                      borderRadius: "3px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.round((h.count / maxHotspotCount) * 100)}%`,
                        height: "100%",
                        backgroundColor: "var(--primary)",
                        borderRadius: "3px",
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: "12px",
                      color: "var(--text-muted)",
                      width: "70px",
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {formatPlural(h.count, "report")}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 7. Teams Table */}
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--bg-surface)",
              padding: "18px",
            }}
          >
            <div style={{ marginBottom: "14px" }}>
              <h3 style={{ fontSize: "0.95rem", fontWeight: 600, margin: 0, color: "var(--text-ink)" }}>
                Teams
              </h3>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.825rem" }}>
                <thead>
                  <tr
                    style={{
                      borderBottom: "1px solid var(--border)",
                      color: "var(--text-muted)",
                      textAlign: "left",
                    }}
                  >
                    <th style={{ padding: "8px 12px", fontWeight: 600 }}>Team</th>
                    <th style={{ padding: "8px 12px", fontWeight: 600, textAlign: "right" }}>Open jobs</th>
                    <th style={{ padding: "8px 12px", fontWeight: 600, textAlign: "right" }}>Fixed this period</th>
                    <th style={{ padding: "8px 12px", fontWeight: 600, textAlign: "right" }}>Average time to fix</th>
                    <th style={{ padding: "8px 12px", fontWeight: 600, textAlign: "right" }}>Overdue</th>
                  </tr>
                </thead>
                <tbody>
                  {data.teams_stats.map((t, idx) => (
                    <tr
                      key={idx}
                      style={{
                        borderBottom: "1px solid var(--border)",
                        backgroundColor: idx % 2 === 0 ? "transparent" : "var(--bg-subtle)",
                      }}
                    >
                      <td style={{ padding: "10px 12px", fontWeight: 600, color: "var(--text-ink)" }}>
                        {t.name}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {t.open}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {t.fixed}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {t.avg_time || "No jobs yet"}
                      </td>
                      <td
                        style={{
                          padding: "10px 12px",
                          textAlign: "right",
                          fontWeight: t.overdue > 0 ? 600 : 400,
                          color: t.overdue > 0 ? "var(--priority-high, #C2540A)" : "var(--text-muted)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {t.overdue}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 8. Waiting Longest (Top 8 oldest unresolved reports) */}
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--bg-surface)",
              padding: "18px",
            }}
          >
            <div style={{ marginBottom: "14px" }}>
              <h3 style={{ fontSize: "0.95rem", fontWeight: 600, margin: 0, color: "var(--text-ink)" }}>
                Waiting longest
              </h3>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.825rem" }}>
                <thead>
                  <tr
                    style={{
                      borderBottom: "1px solid var(--border)",
                      color: "var(--text-muted)",
                      textAlign: "left",
                    }}
                  >
                    <th style={{ padding: "8px 12px", fontWeight: 600 }}>Code</th>
                    <th style={{ padding: "8px 12px", fontWeight: 600 }}>Title</th>
                    <th style={{ padding: "8px 12px", fontWeight: 600 }}>Area</th>
                    <th style={{ padding: "8px 12px", fontWeight: 600 }}>Received</th>
                    <th style={{ padding: "8px 12px", fontWeight: 600, textAlign: "right" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.oldest_reports.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => (window.location.href = `/senior/reports?id=${r.tracking_id}`)}
                      style={{
                        borderBottom: "1px solid var(--border)",
                        cursor: "pointer",
                      }}
                      className="report-row-item"
                    >
                      <td style={{ padding: "10px 12px", fontFamily: "var(--font-mono, monospace)", fontSize: "0.78rem" }}>
                        {r.tracking_id}
                      </td>
                      <td style={{ padding: "10px 12px", fontWeight: 500, color: "var(--text-ink)" }}>
                        {r.title}
                      </td>
                      <td style={{ padding: "10px 12px", color: "var(--text-muted)" }}>
                        {r.area_name || r.location_text}
                      </td>
                      <td style={{ padding: "10px 12px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                        {formatDate(r.received_at)}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right", whiteSpace: "nowrap" }}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                          <span
                            style={{
                              color: r.days_overdue > 0 ? "var(--priority-high, #C2540A)" : "var(--text-muted)",
                              fontWeight: r.days_overdue > 0 ? 600 : 400,
                            }}
                          >
                            {r.days_overdue > 0 ? `${r.days_overdue} days overdue` : "Open"}
                          </span>
                          {r.days_overdue > 0 && (
                            <button
                              type="button"
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  setRemindingId(r.tracking_id);
                                  const res = await fetch(`/api/v1/complaints/${r.tracking_id}/escalation/remind`, {
                                    method: "POST",
                                    headers: { Authorization: `Bearer ${auth?.access_token}` },
                                  });
                                  if (res.ok) {
                                    toast.success(`Reminder sent to the officer for ${r.tracking_id}.`);
                                    setRemindedIds((prev) => new Set(prev).add(r.tracking_id));
                                  } else {
                                    toast.error("Could not send reminder.");
                                  }
                                } catch {
                                  toast.error("Could not send reminder.");
                                } finally {
                                  setRemindingId(null);
                                }
                              }}
                              disabled={remindingId === r.tracking_id || remindedIds.has(r.tracking_id)}
                              className="btn-secondary"
                              style={{
                                padding: "3px 8px",
                                fontSize: "11px",
                              }}
                            >
                              {remindedIds.has(r.tracking_id)
                                ? "Reminded"
                                : remindingId === r.tracking_id
                                ? "Sending…"
                                : "Remind the officer"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </PageContainer>
  );
}
