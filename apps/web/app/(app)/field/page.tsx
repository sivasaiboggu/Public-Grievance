"use client";

import React, { useEffect, useState, useRef, useMemo } from "react";
import {
  Camera,
  CheckCircle2,
  ExternalLink,
  MapPin,
  Loader2,
  ChevronLeft,
  RotateCcw,
  Trash2,
  Navigation,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import imageCompression from "browser-image-compression";
import { getTimeOfDayGreeting, displayName } from "@grievancegrid/api-client";
import { PhotoGallery } from "../../../components/PhotoGallery";
import { StatusChip } from "../../../components/StatusChip";
import { ReportRow, type ReportRowData } from "../../../components/ReportRow";
import { PageContainer } from "../../../components/Layout";
import { getStoredAuth } from "../../../lib/auth";
import { showToastError } from "../../../lib/api";
import { formatDateTime, formatPlural, CATEGORY_METADATA } from "../../../lib/labels";

interface FieldAssignment {
  id: string;
  complaint_id: string;
  tracking_id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  location_text: string;
  area_name?: string;
  latitude: number;
  longitude: number;
  notes: string | null;
  assigned_at: string;
  evidence_count?: number;
}

interface ComplaintDetailState {
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

interface PhotoSlotState {
  file: File | null;
  previewUrl: string | null;
  compressing: boolean;
}

export default function FieldOperationsPage() {
  const auth = getStoredAuth();
  const [assignments, setAssignments] = useState<FieldAssignment[]>([]);
  const [selected, setSelected] = useState<FieldAssignment | null>(null);
  const [detailData, setDetailData] = useState<ComplaintDetailState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [note, setNote] = useState("");
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");
  const [descExpanded, setDescExpanded] = useState(false);

  // Photo slots
  const [beforeSlot, setBeforeSlot] = useState<PhotoSlotState>({
    file: null,
    previewUrl: null,
    compressing: false,
  });

  const [afterSlot, setAfterSlot] = useState<PhotoSlotState>({
    file: null,
    previewUrl: null,
    compressing: false,
  });

  const beforeInputRef = useRef<HTMLInputElement>(null);
  const afterInputRef = useRef<HTMLInputElement>(null);

  const headers = useMemo(
    () => ({
      Authorization: `Bearer ${auth?.access_token}`,
    }),
    [auth]
  );

  const loadAssignments = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/field/assignments", {
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
      });
      if (res.ok) {
        const data = await res.json();
        setAssignments(data);
        if (data.length > 0) {
          const found = selected ? data.find((d: FieldAssignment) => d.id === selected.id) : null;
          const current = found || data[0];
          setSelected(current);
          fetchDetail(current.tracking_id);
        }
      } else {
        toast.error("Could not fetch assigned jobs.");
      }
    } catch (err) {
      showToastError(err, "Could not connect to service.");
    } finally {
      setLoading(false);
    }
  };

  const fetchDetail = async (trackingId: string) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/v1/complaints/${encodeURIComponent(trackingId)}`, {
        headers,
      });
      if (res.ok) {
        const d = await res.json();
        setDetailData({
          events: d.events || [],
          evidence: d.evidence || [],
        });
      }
    } catch {
      // Ignored
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    loadAssignments();
  }, []);

  const selectJob = (job: FieldAssignment) => {
    setSelected(job);
    setMobileView("detail");
    setNote("");
    setDescExpanded(false);
    removePhoto("before");
    removePhoto("after");
    fetchDetail(job.tracking_id);
  };

  const handlePhotoSelect = async (
    e: React.ChangeEvent<HTMLInputElement>,
    slotType: "before" | "after"
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const setSlot = slotType === "before" ? setBeforeSlot : setAfterSlot;
    setSlot((prev) => ({ ...prev, compressing: true }));

    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 1.5,
        maxWidthOrHeight: 1600,
        useWebWorker: true,
        initialQuality: 0.8,
      });
      const previewUrl = URL.createObjectURL(compressed);
      setSlot({ file: compressed, previewUrl, compressing: false });
    } catch {
      const previewUrl = URL.createObjectURL(file);
      setSlot({ file, previewUrl, compressing: false });
    }
  };

  const removePhoto = (slotType: "before" | "after") => {
    const setSlot = slotType === "before" ? setBeforeSlot : setAfterSlot;
    const ref = slotType === "before" ? beforeInputRef : afterInputRef;

    setSlot((prev) => {
      if (prev.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return { file: null, previewUrl: null, compressing: false };
    });

    if (ref.current) ref.current.value = "";
  };

  const hasExistingAfterPhoto = detailData?.evidence?.some((e) => e.phase === "after");
  const hasExistingBeforePhoto = detailData?.evidence?.some((e) => e.phase === "before");
  const canMarkFixed = afterSlot.file !== null || hasExistingAfterPhoto;

  const handleProgress = async (action: "started" | "note" | "fixed") => {
    if (!selected) return;

    if (action === "fixed" && !canMarkFixed) {
      toast.error("Add an after photo to finish this job.");
      return;
    }

    setUpdating(true);
    try {
      const formData = new FormData();
      formData.append("status", action);

      if (note.trim()) {
        formData.append("note", note.trim());
      }

      if (beforeSlot.file) {
        formData.append("before_photo", beforeSlot.file);
      }

      if (afterSlot.file) {
        formData.append("after_photo", afterSlot.file);
      }

      const res = await fetch(`/api/v1/field/tasks/${selected.complaint_id}/progress`, {
        method: "POST",
        headers,
        body: formData,
      });

      if (res.ok) {
        toast.success(
          action === "started"
            ? "Work marked as started."
            : action === "fixed"
            ? "Job marked as fixed."
            : "Note saved."
        );
        setNote("");
        removePhoto("before");
        removePhoto("after");
        await loadAssignments();
        if (selected) fetchDetail(selected.tracking_id);
      } else {
        const err = await res.json();
        showToastError(err, "Could not update status.");
      }
    } catch (err) {
      showToastError(err, "Could not update status.");
    } finally {
      setUpdating(false);
    }
  };

  const getDeadlineInfo = (item: FieldAssignment) => {
    const meta = CATEGORY_METADATA[item.category as keyof typeof CATEGORY_METADATA];
    const targetDays = meta ? meta.targetDays : 7;
    const receivedDate = new Date(item.assigned_at || new Date());
    const deadlineDate = new Date(receivedDate.getTime() + targetDays * 24 * 60 * 60 * 1000);
    const now = new Date();
    const diffHours = (deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (item.status === "resolved" || item.status === "rejected") {
      return { text: "", isOverdue: false };
    }
    if (diffHours < 0) {
      const daysOver = Math.max(1, Math.abs(Math.floor(diffHours / 24)));
      return { text: `${daysOver} day${daysOver > 1 ? "s" : ""} overdue`, isOverdue: true };
    }
    const daysRemaining = Math.max(1, Math.ceil(diffHours / 24));
    return { text: `Due in ${daysRemaining} day${daysRemaining > 1 ? "s" : ""}`, isOverdue: false };
  };

  // Action Buttons Component
  const ActionButtons = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        {selected?.status !== "in_progress" && selected?.status !== "resolved" && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => handleProgress("started")}
            disabled={updating}
            style={{ minHeight: "44px", padding: "0 16px", fontSize: "14px" }}
          >
            Start job
          </button>
        )}

        <button
          type="button"
          className="btn-secondary"
          onClick={() => handleProgress("note")}
          disabled={updating || !note.trim()}
          style={{ minHeight: "44px", padding: "0 16px", fontSize: "14px" }}
        >
          Save note
        </button>

        {selected?.status !== "resolved" && (
          <button
            type="button"
            className="btn-primary"
            onClick={() => handleProgress("fixed")}
            disabled={updating || !canMarkFixed}
            style={{ minHeight: "44px", padding: "0 20px", fontSize: "14px", marginLeft: "auto" }}
          >
            {updating ? <Loader2 size={16} className="spin" /> : "Mark as fixed"}
          </button>
        )}
      </div>

      {!canMarkFixed && selected?.status !== "resolved" && (
        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
          Add an after photo to finish this job.
        </span>
      )}
    </div>
  );

  return (
    <div style={{ height: "calc(100dvh - var(--header-height, 56px))", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Title Bar aligned to shared container */}
      <div
        style={{
          width: "100%",
          maxWidth: "var(--shell-max, 1280px)",
          margin: "0 auto",
          padding: "16px 24px 12px",
          boxSizing: "border-box",
          flexShrink: 0,
        }}
      >
        {(() => {
          const workerName = displayName(auth?.user?.name);
          const greeting = workerName ? `${getTimeOfDayGreeting()}, ${workerName}` : getTimeOfDayGreeting();
          const activeJobs = assignments.filter((a) => a.status !== "resolved" && a.status !== "rejected");
          const liveSentence =
            activeJobs.length === 0
              ? "You have no open jobs assigned right now."
              : `You have ${activeJobs.length} job${activeJobs.length === 1 ? "" : "s"} assigned to you today.`;

          return (
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
        className="field-viewport-container"
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
        {/* Left List Pane (Jobs) */}
        <div
          style={{
            width: "380px",
            flexShrink: 0,
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md) 0 0 var(--radius-md)",
            borderRight: "none",
            backgroundColor: "var(--bg-surface)",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
          }}
          className={`field-list-pane ${mobileView === "detail" ? "mobile-hidden-pane" : ""}`}
          role="listbox"
          aria-label="Assigned jobs"
        >
          {loading ? (
            <div style={{ padding: "16px" }}>
              {[1, 2, 3].map((n) => (
                <div key={n} className="skeleton" style={{ height: "70px", marginBottom: "8px", borderRadius: "var(--radius-sm)" }} />
              ))}
            </div>
          ) : assignments.length === 0 ? (
            <div style={{ padding: "40px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: "14px" }}>
              No assigned jobs right now.
            </div>
          ) : (
            (() => {
              const todoJobs = assignments.filter((a) => a.status !== "resolved" && a.status !== "rejected");
              const doneJobs = assignments.filter((a) => a.status === "resolved" || a.status === "rejected");

              return (
                <div>
                  {/* To do section */}
                  <div
                    style={{
                      padding: "8px 14px",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "var(--text-muted)",
                      backgroundColor: "var(--bg-subtle)",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    To do ({todoJobs.length})
                  </div>
                  {todoJobs.length === 0 ? (
                    <div style={{ padding: "20px 14px", fontSize: "13px", color: "var(--text-muted)", textAlign: "center" }}>
                      All caught up! No pending jobs.
                    </div>
                  ) : (
                    todoJobs.map((item) => {
                      const dl = getDeadlineInfo(item);
                      const rowData: ReportRowData = {
                        id: item.id,
                        tracking_id: item.tracking_id,
                        title: item.title,
                        status: item.status as any,
                        category: item.category,
                        location_text: item.location_text,
                        area_name: item.area_name,
                        received_at: item.assigned_at,
                        isOverdue: dl.isOverdue,
                        dueText: dl.text,
                      };
                      return (
                        <ReportRow
                          key={item.id}
                          report={rowData}
                          isSelected={selected?.id === item.id}
                          onSelect={() => selectJob(item)}
                        />
                      );
                    })
                  )}

                  {/* Done section */}
                  {doneJobs.length > 0 && (
                    <>
                      <div
                        style={{
                          padding: "8px 14px",
                          fontSize: "12px",
                          fontWeight: 600,
                          color: "var(--text-muted)",
                          backgroundColor: "var(--bg-subtle)",
                          borderTop: "1px solid var(--border)",
                          borderBottom: "1px solid var(--border)",
                        }}
                      >
                        Done ({doneJobs.length})
                      </div>
                      {doneJobs.map((item) => {
                        const dl = getDeadlineInfo(item);
                        const rowData: ReportRowData = {
                          id: item.id,
                          tracking_id: item.tracking_id,
                          title: item.title,
                          status: item.status as any,
                          category: item.category,
                          location_text: item.location_text,
                          area_name: item.area_name,
                          received_at: item.assigned_at,
                          isOverdue: dl.isOverdue,
                          dueText: dl.text,
                        };
                        return (
                          <ReportRow
                            key={item.id}
                            report={rowData}
                            isSelected={selected?.id === item.id}
                            onSelect={() => selectJob(item)}
                          />
                        );
                      })}
                    </>
                  )}
                </div>
              );
            })()
          )}
        </div>

        {/* Right Detail Pane */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            border: "1px solid var(--border)",
            borderRadius: "0 var(--radius-md) var(--radius-md) 0",
            backgroundColor: "var(--bg-surface)",
            overflowY: "auto",
            padding: "24px",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
          }}
          className={`field-detail-pane ${mobileView === "list" ? "mobile-hidden-pane" : ""}`}
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
              <span>Back to jobs</span>
            </button>
          </div>

          {!selected ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted)" }}>
              Select a job to view instructions and start work.
            </div>
          ) : (
            <>
              {/* 1. Header: code, status, title, area */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
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
                  <StatusChip status={selected.status as any} />
                </div>

                <h2
                  style={{
                    fontSize: "1.25rem",
                    fontWeight: 600,
                    color: "var(--text-ink)",
                    margin: "0 0 8px",
                    lineHeight: 1.35,
                    wordBreak: "break-word",
                  }}
                >
                  {selected.title}
                </h2>

                <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                  {selected.area_name || selected.location_text}
                </div>
              </div>

              {/* 2. Directions button beside address */}
              <div
                style={{
                  borderTop: "1px solid var(--border-subtle)",
                  paddingTop: "16px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: "6px", flex: 1, minWidth: "240px" }}>
                  <MapPin size={16} color="var(--primary)" style={{ flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-ink)" }}>
                      {selected.location_text}
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                      {selected.latitude.toFixed(4)}° N, {selected.longitude.toFixed(4)}° E
                    </div>
                  </div>
                </div>

                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${selected.latitude},${selected.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary"
                  style={{
                    minHeight: "44px",
                    padding: "0 16px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    textDecoration: "none",
                    fontWeight: 600,
                    fontSize: "13px",
                  }}
                >
                  <Navigation size={15} />
                  <span>Directions</span>
                </a>
              </div>

              {/* 3. What the resident wrote (collapsed to 3 lines with Show more) */}
              <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "16px" }}>
                <h3 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-muted)", margin: "0 0 6px" }}>
                  What the resident wrote
                </h3>
                <div
                  style={{
                    fontSize: "14px",
                    lineHeight: 1.55,
                    color: "var(--text-ink)",
                    backgroundColor: "var(--bg-subtle)",
                    borderRadius: "var(--radius-sm)",
                    padding: "12px 14px",
                    overflow: "hidden",
                    display: "-webkit-box",
                    WebkitLineClamp: descExpanded ? "unset" : 3,
                    WebkitBoxOrient: "vertical",
                    wordBreak: "break-word",
                  }}
                >
                  {selected.description}
                </div>
                {selected.description.length > 120 && (
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setDescExpanded(!descExpanded)}
                    style={{ fontSize: "12px", color: "var(--primary)", padding: "4px 0", marginTop: "2px" }}
                  >
                    {descExpanded ? "Show less" : "Show more"}
                  </button>
                )}
              </div>

              {/* Officer Instructions / Notes if any */}
              {selected.notes && (
                <div
                  style={{
                    backgroundColor: "var(--primary-subtle)",
                    borderRadius: "var(--radius-sm)",
                    padding: "12px 14px",
                    borderLeft: "3px solid var(--primary)",
                  }}
                >
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--primary)" }}>
                    Officer instructions:
                  </span>
                  <div style={{ fontSize: "13px", color: "var(--text-ink)", marginTop: "2px" }}>
                    {selected.notes}
                  </div>
                </div>
              )}

              {/* 4. Photos: Two equal slots 'Before' and 'After' */}
              <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "16px" }}>
                <h3 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-muted)", margin: "0 0 12px" }}>
                  Photos
                </h3>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                  {/* Before Photo Slot */}
                  <div>
                    <div style={{ fontSize: "12px", fontWeight: 600, marginBottom: "6px" }}>
                      Before photo
                    </div>
                    <div
                      style={{
                        height: "140px",
                        border: "2px dashed var(--border)",
                        borderRadius: "var(--radius-md)",
                        backgroundColor: "var(--bg-subtle)",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        position: "relative",
                        overflow: "hidden",
                      }}
                    >
                      <input
                        ref={beforeInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => handlePhotoSelect(e, "before")}
                        style={{ display: "none" }}
                      />

                      {beforeSlot.compressing ? (
                        <Loader2 size={24} className="spin" color="var(--primary)" />
                      ) : beforeSlot.previewUrl ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={beforeSlot.previewUrl}
                            alt="Before preview"
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                          <div
                            style={{
                              position: "absolute",
                              bottom: 6,
                              right: 6,
                              display: "flex",
                              gap: "6px",
                            }}
                          >
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => beforeInputRef.current?.click()}
                              style={{ padding: "4px 8px", fontSize: "11px", minHeight: "28px" }}
                            >
                              Retake
                            </button>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => removePhoto("before")}
                              style={{ padding: "4px 8px", fontSize: "11px", minHeight: "28px" }}
                            >
                              Remove
                            </button>
                          </div>
                        </>
                      ) : hasExistingBeforePhoto ? (
                        <div style={{ textAlign: "center", color: "var(--success)" }}>
                          <CheckCircle2 size={24} style={{ margin: "0 auto 4px" }} />
                          <span style={{ fontSize: "12px", fontWeight: 500 }}>Photo attached</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => beforeInputRef.current?.click()}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: "6px",
                            color: "var(--text-muted)",
                            minHeight: "44px",
                            justifyContent: "center",
                          }}
                        >
                          <Camera size={22} />
                          <span style={{ fontSize: "12px", fontWeight: 500 }}>Add photo</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* After Photo Slot */}
                  <div>
                    <div style={{ fontSize: "12px", fontWeight: 600, marginBottom: "6px" }}>
                      After photo <span style={{ color: "var(--primary)" }}>*</span>
                    </div>
                    <div
                      style={{
                        height: "140px",
                        border: "2px dashed var(--border)",
                        borderRadius: "var(--radius-md)",
                        backgroundColor: "var(--bg-subtle)",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        position: "relative",
                        overflow: "hidden",
                      }}
                    >
                      <input
                        ref={afterInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => handlePhotoSelect(e, "after")}
                        style={{ display: "none" }}
                      />

                      {afterSlot.compressing ? (
                        <Loader2 size={24} className="spin" color="var(--primary)" />
                      ) : afterSlot.previewUrl ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={afterSlot.previewUrl}
                            alt="After preview"
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                          <div
                            style={{
                              position: "absolute",
                              bottom: 6,
                              right: 6,
                              display: "flex",
                              gap: "6px",
                            }}
                          >
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => afterInputRef.current?.click()}
                              style={{ padding: "4px 8px", fontSize: "11px", minHeight: "28px" }}
                            >
                              Retake
                            </button>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => removePhoto("after")}
                              style={{ padding: "4px 8px", fontSize: "11px", minHeight: "28px" }}
                            >
                              Remove
                            </button>
                          </div>
                        </>
                      ) : hasExistingAfterPhoto ? (
                        <div style={{ textAlign: "center", color: "var(--success)" }}>
                          <CheckCircle2 size={24} style={{ margin: "0 auto 4px" }} />
                          <span style={{ fontSize: "12px", fontWeight: 500 }}>Photo attached</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => afterInputRef.current?.click()}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: "6px",
                            color: "var(--text-muted)",
                            minHeight: "44px",
                            justifyContent: "center",
                          }}
                        >
                          <Camera size={22} />
                          <span style={{ fontSize: "12px", fontWeight: 500 }}>Add photo</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--text-muted)" }}>
                  Add an after photo to finish this job.
                </div>
              </div>

              {/* 5. What did you see or do? Note */}
              <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "16px" }}>
                <label
                  htmlFor="field-note-input"
                  style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-ink)", display: "block", marginBottom: "6px" }}
                >
                  What did you see or do?
                </label>
                <textarea
                  id="field-note-input"
                  rows={3}
                  placeholder="Tell the resident what you found or did."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px",
                    fontSize: "14px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border)",
                    boxSizing: "border-box",
                    resize: "vertical",
                  }}
                />
              </div>

              {/* 6. Desktop Action buttons */}
              <div className="desktop-actions" style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "16px" }}>
                <ActionButtons />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Sticky Bottom Bar for Phone Screens */}
      {selected && (
        <div
          className="mobile-sticky-actions"
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
          <ActionButtons />
        </div>
      )}

      {/* Responsive layout styles */}
      <style jsx>{`
        @media (max-width: 1023px) {
          .field-viewport-container {
            padding: 0 16px 12px !important;
          }
          :global(.field-list-pane),
          :global(.field-detail-pane) {
            width: 100% !important;
            border-radius: var(--radius-md) !important;
            border-right: 1px solid var(--border) !important;
          }
          .mobile-only-back {
            display: block !important;
          }
          .mobile-hidden-pane {
            display: none !important;
          }
          .desktop-actions {
            display: none !important;
          }
          .mobile-sticky-actions {
            display: block !important;
          }
        }
      `}</style>
    </div>
  );
}
