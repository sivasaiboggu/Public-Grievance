"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search, ChevronRight, AlertCircle, RefreshCw } from "lucide-react";
import type { Complaint } from "@grievancegrid/api-client";
import { StatusChip } from "../../../components/StatusChip";
import { WorkspaceContainer, PageHeader } from "../../../components/Layout";
import { getApiClient } from "../../../lib/api";
import { getStoredAuth } from "../../../lib/auth";
import { formatFullDate, formatRelativeTime, displayName, getTimeOfDayGreeting } from "../../../lib/labels";

export default function CitizenHomePage() {
  const router = useRouter();
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lookupId, setLookupId] = useState("");
  const [auth, setAuth] = useState(getStoredAuth());

  useEffect(() => {
    document.title = "Reports | Public GrievanceGrid";
    setAuth(getStoredAuth());
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const client = getApiClient();
      const res = await client.list(0);
      setComplaints(res.items);
    } catch {
      setError("Could not load your reports. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupId.trim()) return;
    router.push(`/citizen/reports/${encodeURIComponent(lookupId.trim().toUpperCase())}`);
  };

  const name = displayName(auth?.user?.name);
  const timeGreeting = getTimeOfDayGreeting();
  const greeting = name ? `${timeGreeting}, ${name}` : timeGreeting;

  const openCount = complaints.filter(
    (c) => c.status !== "resolved" && c.status !== "rejected"
  ).length;

  const liveSentence = loading
    ? undefined
    : openCount > 0
    ? openCount === 1
      ? "1 of your reports is being worked on."
      : `${openCount} of your reports are being worked on.`
    : "You have no open reports.";

  return (
    <WorkspaceContainer>
      <PageHeader
        title={greeting}
        description={liveSentence}
        action={
          <Link href="/citizen/report" className="btn btn-primary">
            <Plus size={18} />
            <span>Report a problem</span>
          </Link>
        }
      />

      {/* Small Track by ID Field */}
      <div className="card" style={{ marginBottom: "24px", padding: "14px 16px" }}>
        <form onSubmit={handleLookup} style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <div style={{ position: "relative", flex: 1 }}>
            <Search
              size={16}
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)",
              }}
            />
            <input
              type="text"
              placeholder="Enter a reference code"
              value={lookupId}
              onChange={(e) => setLookupId(e.target.value)}
              style={{ paddingLeft: "36px", minHeight: "40px", fontSize: "0.875rem" }}
              aria-label="Enter a reference code"
            />
          </div>
          <button
            type="submit"
            className="btn btn-secondary"
            style={{
              minHeight: "40px",
              padding: "0 18px",
              flexShrink: 0,
              fontWeight: 500,
            }}
          >
            Track
          </button>
        </form>
      </div>

      {/* Error Banner */}
      {error && (
        <div role="alert" className="banner banner-error" style={{ marginBottom: "24px" }}>
          <AlertCircle size={18} style={{ flexShrink: 0, marginTop: "2px" }} />
          <div style={{ flex: 1, display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <span>{error}</span>
            <button
              type="button"
              onClick={loadData}
              className="btn-ghost"
              style={{ padding: "4px 8px", minHeight: "32px", fontSize: "0.8125rem" }}
            >
              <RefreshCw size={14} /> Retry
            </button>
          </div>
        </div>
      )}

      {/* Loading Skeletons */}
      {loading && (
        <div className="divided-list">
          {[1, 2, 3].map((n) => (
            <div key={n} style={{ padding: "18px", display: "flex", flexDirection: "column", gap: "8px" }}>
              <div className="skeleton" style={{ width: "35%", height: "18px" }} />
              <div className="skeleton" style={{ width: "20%", height: "14px" }} />
            </div>
          ))}
        </div>
      )}

      {/* Reports List */}
      {!loading && !error && (
        <>
          {complaints.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
              <h2 style={{ fontSize: "1.125rem", marginBottom: "8px" }}>No reports yet</h2>
              <p className="text-muted" style={{ maxWidth: "420px", margin: "0 auto 20px", fontSize: "0.875rem" }}>
                When you report a problem, you&apos;ll see it here.
              </p>
              <Link href="/citizen/report" className="btn btn-primary">
                <Plus size={18} />
                <span>Report a problem</span>
              </Link>
            </div>
          ) : (
            <div className="divided-list">
              {complaints.map((item) => {
                const fullDate = formatFullDate(item.received_at);
                const relTime = formatRelativeTime(item.received_at);

                return (
                  <Link
                    key={item.id}
                    href={`/citizen/reports/${item.tracking_id}`}
                    className="divided-item"
                    style={{
                      padding: "16px 20px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "16px",
                      textDecoration: "none",
                      borderBottom: "1px solid var(--border)",
                      transition: "background-color 150ms ease",
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                        <span
                          className="tracking-code"
                          style={{ fontSize: "0.875rem", color: "var(--primary)" }}
                        >
                          {item.tracking_id}
                        </span>
                        <StatusChip status={item.status} />
                      </div>

                      <div
                        className="line-clamp-2"
                        style={{
                          fontSize: "0.9375rem",
                          fontWeight: 500,
                          color: "var(--text-ink)",
                          lineHeight: 1.35,
                          marginTop: "2px",
                        }}
                      >
                        {item.title}
                      </div>

                      <div
                        className="text-muted"
                        style={{
                          fontSize: "0.8125rem",
                          marginTop: "2px",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {item.area_name || item.location_text}
                        </span>
                        <span style={{ flexShrink: 0 }}>·</span>
                        <span title={fullDate} className="tabular" style={{ flexShrink: 0 }}>
                          {relTime || fullDate}
                        </span>
                      </div>
                    </div>

                    <ChevronRight size={18} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}
    </WorkspaceContainer>
  );
}
