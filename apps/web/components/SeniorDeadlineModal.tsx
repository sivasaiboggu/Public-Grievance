"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, X, ArrowRight, BellRing } from "lucide-react";
import { toast } from "sonner";

export interface SeniorAlertData {
  report_id: string;
  tracking_id: string;
  title: string;
  category: string;
  category_label?: string;
  location: string;
  overdue_hours: number;
  message: string;
}

interface SeniorDeadlineModalProps {
  alert: SeniorAlertData;
  authToken?: string;
  onDismiss: () => void;
}

export function SeniorDeadlineModal({
  alert,
  authToken,
  onDismiss,
}: SeniorDeadlineModalProps) {
  const router = useRouter();
  const [reminding, setReminding] = useState(false);

  const handleOpenReport = () => {
    onDismiss();
    router.push(`/senior/reports?search=${encodeURIComponent(alert.tracking_id)}`);
  };

  const handleRemindOfficer = async () => {
    setReminding(true);
    try {
      const res = await fetch(`/api/v1/senior/reports/${alert.report_id}/remind-officer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
      });

      if (!res.ok) {
        throw new Error("Could not send reminder.");
      }

      const data = await res.json();
      toast.success(data.message || "Reminder sent to the officer.");
      onDismiss();
    } catch (err: any) {
      toast.error(err.message || "Failed to send reminder.");
    } finally {
      setReminding(false);
    }
  };

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="senior-alert-title"
      aria-describedby="senior-alert-desc"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(4px)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onDismiss();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "460px",
          backgroundColor: "var(--bg-surface, #ffffff)",
          borderRadius: "var(--radius-lg, 12px)",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
          border: "1px solid var(--border, #e2e8f0)",
          overflow: "hidden",
        }}
      >
        {/* Urgent header accent bar */}
        <div style={{ height: "4px", backgroundColor: "var(--danger, #ef4444)" }} />

        <div style={{ padding: "24px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  backgroundColor: "rgba(239, 68, 68, 0.12)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--danger, #ef4444)",
                  flexShrink: 0,
                }}
              >
                <AlertTriangle size={20} />
              </div>
              <h2
                id="senior-alert-title"
                style={{
                  fontSize: "1.0625rem",
                  fontWeight: 600,
                  color: "var(--text-ink, #0f172a)",
                  margin: 0,
                  lineHeight: 1.3,
                }}
              >
                {alert.tracking_id} passed its deadline
              </h2>
            </div>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss alert"
              style={{
                background: "none",
                border: "none",
                padding: "6px",
                cursor: "pointer",
                color: "var(--text-muted, #64748b)",
                borderRadius: "6px",
              }}
            >
              <X size={18} />
            </button>
          </div>

          <div
            id="senior-alert-desc"
            style={{
              marginTop: "16px",
              padding: "12px 14px",
              backgroundColor: "var(--bg-subtle, #f8fafc)",
              borderRadius: "8px",
              border: "1px solid var(--border-subtle, #f1f5f9)",
              fontSize: "0.875rem",
              lineHeight: 1.5,
              color: "var(--text-ink, #1e293b)",
            }}
          >
            <p style={{ margin: 0 }}>
              <span style={{ fontWeight: 600 }}>{alert.category_label || alert.category}</span>
              {alert.location ? `, ${alert.location}` : ""}.
            </p>
            <p style={{ margin: "4px 0 0", color: "var(--danger, #ef4444)", fontWeight: 500 }}>
              {alert.overdue_hours} hours overdue.
            </p>
          </div>

          <p style={{ margin: "14px 0 0", fontSize: "0.8125rem", color: "var(--text-secondary, #475569)", lineHeight: 1.45 }}>
            This incident has exceeded its resolution deadline and requires senior authority review or officer escalation.
          </p>

          <div
            style={{
              marginTop: "24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              className="btn-secondary"
              onClick={onDismiss}
              style={{ minHeight: "36px", padding: "6px 14px", fontSize: "0.85rem" }}
            >
              Dismiss
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleRemindOfficer}
              disabled={reminding}
              style={{
                minHeight: "36px",
                padding: "6px 14px",
                fontSize: "0.85rem",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <BellRing size={14} />
              {reminding ? "Reminding..." : "Remind the officer"}
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleOpenReport}
              style={{
                minHeight: "36px",
                padding: "6px 16px",
                fontSize: "0.85rem",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span>Open</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SeniorDeadlineModal;
