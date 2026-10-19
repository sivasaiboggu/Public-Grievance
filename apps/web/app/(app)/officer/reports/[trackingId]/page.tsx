"use client";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import { ArrowLeft, Clock, MapPin, AlertCircle, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { statusLabel, transitions, type Detail, type Status } from "@grievancegrid/api-client";
import { StatusChip } from "../../../../../components/StatusChip";
import { getApiClient } from "../../../../../lib/api";

export default function OfficerReportDetailPage({ params }: { params: Promise<{ trackingId: string }> }) {
  const resolvedParams = use(params);
  const trackingId = resolvedParams.trackingId;

  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [officerNote, setOfficerNote] = useState("");
  const [nextStatus, setNextStatus] = useState<Status>("under_review");
  const [submitting, setSubmitting] = useState(false);

  const loadReport = async () => {
    setLoading(true);
    setError("");
    try {
      const client = getApiClient();
      const res = await client.get(trackingId);
      setDetail(res);
      const allowed = transitions[res.status] || [];
      if (allowed.length > 0) {
        setNextStatus(allowed[0]);
      }
    } catch {
      setError(`Could not find report "${trackingId}" in municipal records.`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [trackingId]);

  const handleStatusUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    if (officerNote.trim().length < 10) {
      toast.error("Please provide an action rationale note of at least 10 characters.");
      return;
    }

    setSubmitting(true);
    try {
      const client = getApiClient();
      const updated = await client.update(detail.tracking_id, nextStatus, officerNote.trim(), detail.version);
      setDetail(updated);
      setOfficerNote("");
      toast.success(`Updated status to ${statusLabel(nextStatus)}.`);
    } catch (err: unknown) {
      const errorMsg = (err as Error)?.message || "";
      if (errorMsg.includes("409")) {
        toast.error("Another officer updated this report concurrently. Reloading latest state.");
        await loadReport();
      } else {
        toast.error("Could not update status. Check rationale note requirements.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: "760px", margin: "0 auto" }}>
        <div className="skeleton" style={{ width: "140px", height: "20px", marginBottom: "20px" }} />
        <div className="card">
          <div className="skeleton" style={{ width: "60%", height: "24px", marginBottom: "12px" }} />
          <div className="skeleton" style={{ width: "30%", height: "16px", marginBottom: "24px" }} />
          <div className="skeleton" style={{ width: "100%", height: "80px" }} />
        </div>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div style={{ maxWidth: "760px", margin: "0 auto" }}>
        <Link href="/officer" className="btn-ghost" style={{ display: "inline-flex", gap: "6px", padding: "6px 0", marginBottom: "16px", textDecoration: "none" }}>
          <ArrowLeft size={16} />
          <span>Back to queue</span>
        </Link>
        <div className="card" style={{ textAlign: "center", padding: "40px 20px" }}>
          <AlertCircle size={32} style={{ color: "var(--error)", margin: "0 auto 12px" }} />
          <h2 style={{ marginBottom: "8px" }}>Report not found</h2>
          <p className="text-muted" style={{ marginBottom: "20px" }}>{error}</p>
          <button type="button" onClick={loadReport} className="btn btn-secondary">
            <RefreshCw size={14} /> Try again
          </button>
        </div>
      </div>
    );
  }

  const allowedTransitions = transitions[detail.status] || [];

  return (
    <div style={{ maxWidth: "760px", margin: "0 auto" }}>
      <Link href="/officer" className="btn-ghost" style={{ display: "inline-flex", gap: "6px", padding: "6px 0", marginBottom: "16px", textDecoration: "none" }}>
        <ArrowLeft size={16} />
        <span>Back to officer queue</span>
      </Link>

      <div className="card" style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", marginBottom: "16px", flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
              <span className="tracking-code" style={{ fontSize: "1rem", color: "var(--primary)" }}>
                {detail.tracking_id}
              </span>
              <StatusChip status={detail.status} />
            </div>
            <h1>{detail.title}</h1>
          </div>
        </div>

        <p style={{ color: "var(--text-ink)", lineHeight: 1.6, marginBottom: "20px" }}>
          {detail.description}
        </p>

        <div style={{ display: "flex", gap: "20px", flexWrap: "wrap", borderTop: "1px solid var(--border)", paddingTop: "16px", fontSize: "0.8125rem" }} className="text-muted">
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <MapPin size={15} />
            <span>{detail.location_text}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Clock size={15} />
            <span>Received {format(new Date(detail.received_at), "dd MMM yyyy, h:mm a")}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span>Record version: v{detail.version}</span>
          </div>
        </div>
      </div>

      {/* Official Decision Panel */}
      <div className="card" style={{ marginBottom: "24px" }}>
        <h2 style={{ fontSize: "1.125rem", marginBottom: "16px" }}>Officer action & decision</h2>

        {allowedTransitions.length === 0 ? (
          <div style={{ padding: "16px", background: "var(--bg-subtle)", borderRadius: "var(--radius-sm)", color: "var(--text-muted)", fontSize: "0.875rem" }}>
            This report is in final status <strong>{statusLabel(detail.status)}</strong>. No further status changes are permitted by municipal protocol.
          </div>
        ) : (
          <form onSubmit={handleStatusUpdate} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label htmlFor="next-status" style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "6px" }}>
                Select next transition
              </label>
              <select
                id="next-status"
                value={nextStatus}
                onChange={(e) => setNextStatus(e.target.value as Status)}
                className="input"
              >
                {allowedTransitions.map((st) => (
                  <option key={st} value={st}>
                    Move to: {statusLabel(st)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="officer-rationale" style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "6px" }}>
                Official rationale note <span style={{ color: "var(--error)" }}>*</span>
              </label>
              <textarea
                id="officer-rationale"
                value={officerNote}
                onChange={(e) => setOfficerNote(e.target.value)}
                placeholder="State specific findings, department assignment, or resolution rationale (min 10 characters)..."
                rows={4}
                className="input"
                style={{ resize: "vertical" }}
              />
              <span className="text-muted" style={{ fontSize: "0.75rem", marginTop: "4px", display: "block" }}>
                Audit trail requirement: Notes are permanently recorded with your officer ID.
              </span>
            </div>

            <button
              type="submit"
              disabled={submitting || officerNote.trim().length < 10}
              className="btn btn-primary"
              style={{ width: "fit-content" }}
            >
              {submitting ? "Recording decision…" : `Record transition to ${statusLabel(nextStatus)}`}
            </button>
          </form>
        )}
      </div>

      {/* Official Status Log */}
      <div className="card">
        <h2 style={{ fontSize: "1.125rem", marginBottom: "16px" }}>Official action log</h2>

        {detail.events && detail.events.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {detail.events.map((ev, index) => (
              <div key={ev.id || index} style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "var(--primary)", marginTop: "6px", flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                    <StatusChip status={ev.status} />
                    <span className="text-muted tabular" style={{ fontSize: "0.75rem" }}>
                      {format(new Date(ev.created_at), "dd MMM yyyy, h:mm a")}
                    </span>
                  </div>
                  <p style={{ fontSize: "0.875rem", marginTop: "4px", color: "var(--text-ink)" }}>
                    {ev.note}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted" style={{ fontSize: "0.875rem" }}>
            No status updates have been recorded yet.
          </p>
        )}
      </div>
    </div>
  );
}
