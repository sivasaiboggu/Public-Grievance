"use client";

import React, { useState } from "react";
import { MapPin, ExternalLink, CheckCircle } from "lucide-react";
import { PhotoUploader } from "./PhotoUploader";

export interface FieldAssignment {
  id: string;
  trackingId: string;
  title: string;
  description: string;
  landmark: string;
  latitude: number;
  longitude: number;
  assignedAt: string;
}

interface FieldWorkDetailProps {
  assignment: FieldAssignment;
  onSubmitReview: (assignmentId: string, note: string, photo: File | null) => Promise<void>;
  busy?: boolean;
}

/**
 * Ready-to-use work-detail component for Field worker role.
 * Includes location with Open in Maps, photo capture, completion note,
 * and clear explanation that finishing field work routes to officer review.
 */
export function FieldWorkDetail({ assignment, onSubmitReview, busy = false }: FieldWorkDetailProps) {
  const [completionNote, setCompletionNote] = useState("");
  const [completionPhoto, setCompletionPhoto] = useState<File | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completionNote.trim()) return;
    await onSubmitReview(assignment.id, completionNote.trim(), completionPhoto);
  };

  return (
    <div className="card" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
      <div>
        <span className="tracking-code" style={{ fontSize: "0.875rem", color: "var(--primary)" }}>
          {assignment.trackingId}
        </span>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 600, margin: "4px 0 8px" }}>
          {assignment.title}
        </h2>
        <p className="text-muted" style={{ fontSize: "0.875rem", margin: 0 }}>
          {assignment.description}
        </p>
      </div>

      {/* Location */}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: "14px" }}>
        <h3 style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: "4px" }}>
          Location
        </h3>
        <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
          <MapPin size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          <span style={{ fontWeight: 500, fontSize: "0.875rem" }}>{assignment.landmark}</span>
        </div>
        <div style={{ marginTop: "6px" }}>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${assignment.latitude},${assignment.longitude}`}
            target="_blank"
            rel="noreferrer"
            style={{
              color: "var(--primary)",
              textDecoration: "none",
              fontSize: "0.8125rem",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              fontWeight: 500,
            }}
          >
            <span>Open in Maps</span>
            <ExternalLink size={12} />
          </a>
        </div>
      </div>

      {/* Completion Work Submission */}
      <form onSubmit={handleSubmit} style={{ borderTop: "1px solid var(--border)", paddingTop: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
        <div className="form-group">
          <label htmlFor="field-note">Work completion note</label>
          <textarea
            id="field-note"
            rows={3}
            required
            placeholder="Describe repairs or inspection carried out on site..."
            value={completionNote}
            onChange={(e) => setCompletionNote(e.target.value)}
            disabled={busy}
          />
        </div>

        <div>
          <label style={{ display: "block", marginBottom: "6px" }}>After-work photo</label>
          <PhotoUploader
            photo={completionPhoto}
            onPhotoSelected={(f) => setCompletionPhoto(f)}
            disabled={busy}
          />
        </div>

        <div style={{ background: "var(--bg-subtle)", padding: "12px 14px", borderRadius: "var(--radius-sm)", fontSize: "0.8125rem", color: "var(--text-ink)" }}>
          Finishing field work doesn&apos;t close the resident&apos;s report. An officer reviews it first.
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          disabled={busy || !completionNote.trim()}
          style={{ width: "100%", gap: "8px" }}
        >
          <CheckCircle size={16} />
          <span>{busy ? "Sending…" : "Send for review"}</span>
        </button>
      </form>
    </div>
  );
}
