"use client";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Clock,
  MapPin,
  Copy,
  Check,
  AlertCircle,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import type { Detail } from "@grievancegrid/api-client";
import { PhotoGallery } from "../../../../../components/PhotoGallery";
import { PhotoUploader } from "../../../../../components/PhotoUploader";
import { StatusChip } from "../../../../../components/StatusChip";
import { ReadingContainer } from "../../../../../components/Layout";
import { getApiClient } from "../../../../../lib/api";
import { formatFullDate, getCategorySLA } from "../../../../../lib/labels";

const STEPS = [
  { id: "submitted", label: "Received" },
  { id: "under_review", label: "Being reviewed" },
  { id: "in_progress", label: "Work started" },
  { id: "resolved", label: "Fixed" },
];

export default function CitizenReportDetailPage({
  params,
}: {
  params: Promise<{ trackingId: string }>;
}) {
  const resolvedParams = use(params);
  const trackingId = resolvedParams.trackingId;

  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [showFullDesc, setShowFullDesc] = useState(false);
  const [showAddPhoto, setShowAddPhoto] = useState(false);
  const [newPhoto, setNewPhoto] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isClustered, setIsClustered] = useState(false);

  // Reopen form
  const [showReopen, setShowReopen] = useState(false);
  const [reopenNote, setReopenNote] = useState("");
  const [reopening, setReopening] = useState(false);

  const loadReport = async () => {
    setLoading(true);
    setError("");
    try {
      const client = getApiClient();
      const res = await client.get(trackingId);
      setDetail(res);

      // Check cluster status
      try {
        const cRes = await fetch(`/api/v1/complaints/${encodeURIComponent(res.id)}/cluster`);
        if (cRes.ok) {
          const cData = await cRes.json();
          setIsClustered(cData.is_clustered);
        }
      } catch {}
    } catch {
      setError(`Could not find report "${trackingId}". It may belong to another account or does not exist.`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [trackingId]);

  const handleCopyId = () => {
    if (!detail) return;
    navigator.clipboard.writeText(detail.tracking_id);
    setCopied(true);
    toast.success("Reference code copied to clipboard.");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleUploadPhoto = async () => {
    if (!newPhoto || !detail) return;

    setUploading(true);
    try {
      const client = getApiClient();
      const form = new FormData();
      form.append("file", newPhoto);
      await client.upload(detail.tracking_id, form);
      toast.success("Photo added successfully.");
      setNewPhoto(null);
      setShowAddPhoto(false);
      await loadReport();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to upload photo.";
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  const handleReopen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail || !reopenNote.trim()) return;

    setReopening(true);
    try {
      const client = getApiClient();
      await client.updateStatus(detail.tracking_id, {
        status: "under_review",
        note: `Resident requested to reopen: ${reopenNote.trim()}`,
        expected_version: detail.version,
      });
      toast.success("Report reopened for review.");
      setShowReopen(false);
      setReopenNote("");
      await loadReport();
    } catch {
      toast.error("Could not reopen report.");
    } finally {
      setReopening(false);
    }
  };

  if (loading) {
    return (
      <ReadingContainer>
        <div className="skeleton" style={{ width: "140px", height: "20px", marginBottom: "20px" }} />
        <div className="card" style={{ padding: "32px" }}>
          <div className="skeleton" style={{ width: "60%", height: "28px", marginBottom: "16px" }} />
          <div className="skeleton" style={{ width: "40%", height: "18px", marginBottom: "24px" }} />
          <div className="skeleton" style={{ width: "100%", height: "120px" }} />
        </div>
      </ReadingContainer>
    );
  }

  if (error || !detail) {
    return (
      <ReadingContainer>
        <Link href="/citizen" className="btn-ghost" style={{ display: "inline-flex", gap: "6px", marginBottom: "16px" }}>
          <ArrowLeft size={16} />
          <span>Back to my reports</span>
        </Link>
        <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <AlertCircle size={32} color="var(--color-danger, #ef4444)" style={{ margin: "0 auto 12px" }} />
          <h2 style={{ fontSize: "1.125rem", marginBottom: "8px" }}>Report not found</h2>
          <p className="text-muted" style={{ fontSize: "0.875rem", margin: "0 0 20px 0" }}>{error}</p>
          <Link href="/citizen" className="btn btn-primary">Return to my reports</Link>
        </div>
      </ReadingContainer>
    );
  }

  const isReportOpen = detail.status !== "resolved" && detail.status !== "rejected";
  const descIsLong = detail.description.length > 280;
  const displayDesc = descIsLong && !showFullDesc ? `${detail.description.slice(0, 280)}…` : detail.description;

  // Compute step index
  const getStepIndex = (status: string) => {
    switch (status) {
      case "submitted":
        return 0;
      case "under_review":
        return 1;
      case "in_progress":
        return 2;
      case "resolved":
        return 3;
      default:
        return 0;
    }
  };

  const currentStep = getStepIndex(detail.status);

  return (
    <ReadingContainer>
      <Link
        href="/citizen"
        className="btn-ghost"
        style={{
          display: "inline-flex",
          gap: "6px",
          padding: "6px 0",
          marginBottom: "16px",
          textDecoration: "none",
        }}
      >
        <ArrowLeft size={16} />
        <span>Back to my reports</span>
      </Link>

      <div className="card wrap-anywhere" style={{ padding: "clamp(20px, 3.5vw, 36px)" }}>
        {/* Header Block: Tracking ID, Copy Button, Status, Title */}
        <div style={{ paddingBottom: "24px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", marginBottom: "8px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <span className="tracking-code" style={{ fontSize: "1rem", color: "var(--primary)" }}>
                {detail.tracking_id}
              </span>
              <button
                type="button"
                onClick={handleCopyId}
                className="btn-ghost"
                style={{ padding: "4px 8px", minHeight: "28px", fontSize: "0.75rem", gap: "4px" }}
                title="Copy reference code"
                aria-label="Copy reference code"
              >
                {copied ? <Check size={14} style={{ color: "var(--color-success, #16a34a)" }} /> : <Copy size={14} />}
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
            </div>
            <StatusChip status={detail.status} />
          </div>

          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, lineHeight: 1.3, color: "var(--color-text)", margin: "8px 0 0" }}>
            {detail.title}
          </h1>

          <div className="text-muted" style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.8125rem", marginTop: "8px" }}>
            <Clock size={15} />
            <span>Received {formatFullDate(detail.received_at)}</span>
          </div>
        </div>

        {/* Plain Language Progress Stepper */}
        {detail.status !== "rejected" && (
          <div style={{ padding: "24px 0", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", position: "relative" }}>
              {STEPS.map((step, idx) => {
                const isPassed = idx <= currentStep;
                const isCurrent = idx === currentStep;

                return (
                  <div key={step.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "6px" }}>
                    <div
                      style={{
                        width: "28px",
                        height: "28px",
                        borderRadius: "50%",
                        backgroundColor: isPassed ? "var(--color-primary, #2563eb)" : "var(--color-background-subtle, #f1f5f9)",
                        color: isPassed ? "#ffffff" : "var(--color-text-muted)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        border: isCurrent ? "2px solid #93c5fd" : "none",
                      }}
                    >
                      {idx + 1}
                    </div>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: isCurrent ? 600 : 400,
                        color: isPassed ? "var(--color-text)" : "var(--color-text-muted)",
                      }}
                    >
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Standard SLA Service Charter and Cluster Notice */}
        <div style={{ padding: "14px 0", borderBottom: "1px solid var(--border)", fontSize: "0.8125rem", color: "var(--color-text-muted)" }}>
          <p style={{ margin: "0 0 4px 0" }}>
            {getCategorySLA(detail.category).charterLine}
          </p>
          {isClustered && (
            <p style={{ margin: 0, color: "var(--primary, #0284c7)", fontWeight: 500 }}>
              Other people reported this too. We are handling it together.
            </p>
          )}
        </div>

        {/* Description Section */}
        <div style={{ padding: "24px 0", borderBottom: "1px solid var(--border)" }}>
          <h2 style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", fontWeight: 600, marginBottom: "8px" }}>
            What you reported
          </h2>
          <p style={{ fontSize: "0.9375rem", lineHeight: 1.6, color: "var(--color-text)", margin: 0 }}>
            {displayDesc}
          </p>
          {descIsLong && (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setShowFullDesc((prev) => !prev)}
              style={{ padding: "4px 0", marginTop: "6px", fontSize: "0.8125rem", color: "var(--color-primary)", fontWeight: 500 }}
            >
              {showFullDesc ? "Show less" : "Show more"}
            </button>
          )}
        </div>

        {/* Location Section */}
        <div style={{ padding: "24px 0", borderBottom: "1px solid var(--border)" }}>
          <h2 style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", fontWeight: 600, marginBottom: "8px" }}>
            Location
          </h2>
          <div style={{ display: "flex", alignItems: "baseline", gap: "6px", marginBottom: "8px" }}>
            <MapPin size={16} color="var(--color-text-muted)" />
            <span style={{ fontSize: "0.9375rem", fontWeight: 500, color: "var(--color-text)" }}>
              {detail.location_text}
            </span>
          </div>

          <div
            style={{
              width: "100%",
              height: "160px",
              borderRadius: "8px",
              overflow: "hidden",
              border: "1px solid var(--border)",
              backgroundColor: "var(--bg-subtle, #f8fafc)",
              marginBottom: "10px",
            }}
          >
            <iframe
              title="Report Location Map"
              width="100%"
              height="100%"
              style={{ border: 0 }}
              loading="lazy"
              src={`https://www.openstreetmap.org/export/embed.html?bbox=${detail.longitude - 0.005}%2C${detail.latitude - 0.003}%2C${detail.longitude + 0.005}%2C${detail.latitude + 0.003}&layer=mapnik&marker=${detail.latitude}%2C${detail.longitude}`}
            />
          </div>

          <div style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)" }}>
            Coordinates: {detail.latitude.toFixed(4)}° N, {detail.longitude.toFixed(4)}° E
          </div>
        </div>

        {/* Photo Evidence Gallery (Step A fix) */}
        {detail.evidence && detail.evidence.length > 0 && (
          <div style={{ padding: "24px 0", borderBottom: "1px solid var(--border)" }}>
            <h2 style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", fontWeight: 600, marginBottom: "12px" }}>
              Photos ({detail.evidence.length})
            </h2>
            <PhotoGallery trackingId={detail.tracking_id} evidence={detail.evidence} />
          </div>
        )}

        {/* Add photo while open */}
        {isReportOpen && (
          <div style={{ padding: "24px 0", borderBottom: "1px solid var(--border)" }}>
            {!showAddPhoto ? (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowAddPhoto(true)}
                style={{ fontSize: "0.8125rem" }}
              >
                Add another photo
              </button>
            ) : (
              <div style={{ backgroundColor: "var(--color-background-subtle, #f8fafc)", padding: "16px", borderRadius: "8px", border: "1px solid var(--border)" }}>
                <PhotoUploader
                  photo={newPhoto}
                  onPhotoSelected={(f) => setNewPhoto(f)}
                  disabled={uploading}
                />
                <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleUploadPhoto}
                    disabled={uploading || !newPhoto}
                  >
                    {uploading ? "Uploading…" : "Upload photo"}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setShowAddPhoto(false);
                      setNewPhoto(null);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Updates Timeline */}
        <div style={{ padding: "24px 0", borderBottom: detail.status === "resolved" ? "1px solid var(--border)" : "none" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "16px" }}>Updates</h2>

          {detail.events && detail.events.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {detail.events.map((ev, index) => (
                <div
                  key={ev.id || index}
                  style={{
                    padding: "12px 16px",
                    borderRadius: "8px",
                    backgroundColor: "var(--color-background-subtle, #f8fafc)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                    <StatusChip status={ev.status} />
                    <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                      {formatFullDate(ev.created_at)}
                    </span>
                  </div>
                  <p style={{ margin: "4px 0 0 0", fontSize: "0.875rem", color: "var(--color-text)", lineHeight: 1.5 }}>
                    {ev.note}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted" style={{ fontSize: "0.875rem", margin: 0 }}>
              No updates recorded yet.
            </p>
          )}
        </div>

        {/* Reopen Option if Fixed and citizen disagrees */}
        {detail.status === "resolved" && (
          <div style={{ paddingTop: "24px" }}>
            {!showReopen ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
                <div>
                  <h3 style={{ fontSize: "0.9375rem", fontWeight: 600, margin: 0 }}>Issue not fixed?</h3>
                  <p style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)", margin: "2px 0 0 0" }}>
                    If the problem persists on site, you can request to reopen this report for review.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowReopen(true)}
                  className="btn-secondary"
                  style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.8125rem" }}
                >
                  <RotateCcw size={14} />
                  <span>Reopen report</span>
                </button>
              </div>
            ) : (
              <form onSubmit={handleReopen} style={{ display: "flex", flexDirection: "column", gap: "12px", backgroundColor: "var(--color-background-subtle, #f8fafc)", padding: "16px", borderRadius: "8px", border: "1px solid var(--border)" }}>
                <label className="field-label" htmlFor="reopen-reason">Explain why this report should be reopened</label>
                <textarea
                  id="reopen-reason"
                  className="field-input"
                  rows={3}
                  required
                  placeholder="e.g. The pothole was partially filled but rainwater has already washed out the asphalt..."
                  value={reopenNote}
                  onChange={(e) => setReopenNote(e.target.value)}
                />
                <div style={{ display: "flex", gap: "8px" }}>
                  <button type="submit" disabled={reopening || !reopenNote.trim()} className="btn-primary">
                    {reopening ? "Submitting..." : "Submit request"}
                  </button>
                  <button type="button" onClick={() => setShowReopen(false)} className="btn-secondary">
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </ReadingContainer>
  );
}
