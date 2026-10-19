"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, AlertCircle } from "lucide-react";

interface AdminSettingsPaneProps {
  authToken?: string;
  onNavigateToCategories: () => void;
  suggestionSummary: any;
}

interface SystemSettingsData {
  area_name: string;
  emergency_number: string;
  default_target_hours: number;
  warn_before_due_hours: number;
  email_sender_name: string;
  email_report_updates: boolean;
  email_new_jobs: boolean;
  email_invites: boolean;
  photo_check_enabled: boolean;
  duplicate_match_enabled: boolean;
  priority_suggestion_enabled: boolean;
  citizen_photo_hint_enabled: boolean;
  photo_authenticity_enabled: boolean;
  senior_alert_popup_enabled: boolean;
}

const DEFAULT_SETTINGS: SystemSettingsData = {
  area_name: "Kochi",
  emergency_number: "112",
  default_target_hours: 48,
  warn_before_due_hours: 12,
  email_sender_name: "Kochi City Municipal Corporation",
  email_report_updates: true,
  email_new_jobs: true,
  email_invites: true,
  photo_check_enabled: true,
  duplicate_match_enabled: true,
  priority_suggestion_enabled: true,
  citizen_photo_hint_enabled: true,
  photo_authenticity_enabled: true,
  senior_alert_popup_enabled: true,
};

function Switch({
  id,
  checked,
  onChange,
  label,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      style={{
        width: "44px",
        height: "24px",
        borderRadius: "12px",
        backgroundColor: checked ? "var(--brand-primary, #0284c7)" : "var(--border, #cbd5e1)",
        position: "relative",
        border: "none",
        cursor: "pointer",
        transition: "background-color 200ms ease",
        padding: 0,
        outline: "none",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          display: "block",
          width: "18px",
          height: "18px",
          borderRadius: "50%",
          backgroundColor: "#ffffff",
          position: "absolute",
          top: "3px",
          left: checked ? "23px" : "3px",
          transition: "left 200ms ease",
          boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
        }}
      />
    </button>
  );
}

export function AdminSettingsPane({
  authToken,
  onNavigateToCategories,
  suggestionSummary,
}: AdminSettingsPaneProps) {
  const [initialData, setInitialData] = useState<SystemSettingsData>(DEFAULT_SETTINGS);
  const [formData, setFormData] = useState<SystemSettingsData>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedInline, setSavedInline] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    fetch("/api/v1/admin/settings", {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          const merged: SystemSettingsData = { ...DEFAULT_SETTINGS, ...data };
          setInitialData(merged);
          setFormData(merged);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [authToken]);

  const hasUnsavedChanges = JSON.stringify(formData) !== JSON.stringify(initialData);

  const handleDiscard = () => {
    setFormData(initialData);
    setFieldErrors({});
  };

  const handleSave = async () => {
    const errors: { [key: string]: string } = {};
    if (!formData.area_name.trim()) {
      errors.area_name = "Area name cannot be empty.";
    }
    if (!formData.emergency_number.trim()) {
      errors.emergency_number = "Emergency number is required.";
    }
    if (formData.default_target_hours < 1 || formData.default_target_hours > 720) {
      errors.default_target_hours = "Must be between 1 and 720 hours.";
    }
    if (formData.warn_before_due_hours < 1 || formData.warn_before_due_hours > 168) {
      errors.warn_before_due_hours = "Must be between 1 and 168 hours.";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setSaving(true);

    try {
      const res = await fetch("/api/v1/admin/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        throw new Error("Could not save settings.");
      }

      const updated = await res.json();
      setInitialData(updated);
      setFormData(updated);
      setSavedInline(true);
      toast.success("Settings saved successfully.");
      setTimeout(() => setSavedInline(false), 2500);
    } catch (err: any) {
      toast.error(err.message || "Failed to update settings.");
    } finally {
      setSaving(false);
    }
  };

  const updateField = <K extends keyof SystemSettingsData>(key: K, value: SystemSettingsData[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  return (
    <div style={{ width: "100%", paddingBottom: "80px" }}>
      {/* Sticky Unsaved Changes Bar */}
      {hasUnsavedChanges && (
        <div
          role="region"
          aria-label="Unsaved changes alert"
          style={{
            position: "sticky",
            top: "16px",
            zIndex: 100,
            marginBottom: "24px",
            padding: "12px 20px",
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--brand-primary, #0284c7)",
            borderRadius: "var(--radius-md)",
            boxShadow: "0 4px 14px rgba(0, 0, 0, 0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                backgroundColor: "var(--brand-primary, #0284c7)",
              }}
            />
            <span style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--text-ink)" }}>
              You have unsaved changes.
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleDiscard}
              disabled={saving}
              style={{ minHeight: "34px", padding: "6px 14px", fontSize: "0.85rem" }}
            >
              Discard
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleSave}
              disabled={saving}
              style={{ minHeight: "34px", padding: "6px 18px", fontSize: "0.85rem" }}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      )}

      {/* SECTION 1: General */}
      <section style={{ marginBottom: "36px" }}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--text-ink)", margin: "0 0 4px 0" }}>
          General
        </h2>
        <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", margin: "0 0 16px 0" }}>
          Basic municipal identity and resident contact numbers.
        </p>

        <div style={{ borderTop: "1px solid var(--border-subtle, #e2e8f0)" }}>
          {/* Area name */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "clamp(220px, 30%, 300px) 1fr",
              gap: "24px",
              padding: "16px 0",
              borderBottom: "1px solid var(--border-subtle, #e2e8f0)",
              alignItems: "start",
            }}
          >
            <div>
              <label
                htmlFor="setting-area-name"
                style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, color: "var(--text-ink)" }}
              >
                Area name
              </label>
              <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                Shown on public portals, notices, and communications.
              </span>
            </div>
            <div style={{ maxWidth: "360px" }}>
              <input
                id="setting-area-name"
                type="text"
                value={formData.area_name}
                onChange={(e) => updateField("area_name", e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  fontSize: "0.875rem",
                  borderRadius: "var(--radius-sm)",
                  border: `1px solid ${fieldErrors.area_name ? "var(--danger)" : "var(--border)"}`,
                }}
              />
              {fieldErrors.area_name && (
                <p style={{ margin: "4px 0 0", fontSize: "0.75rem", color: "var(--danger)" }}>
                  {fieldErrors.area_name}
                </p>
              )}
            </div>
          </div>

          {/* Emergency number */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "clamp(220px, 30%, 300px) 1fr",
              gap: "24px",
              padding: "16px 0",
              borderBottom: "1px solid var(--border-subtle, #e2e8f0)",
              alignItems: "start",
            }}
          >
            <div>
              <label
                htmlFor="setting-emergency-phone"
                style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, color: "var(--text-ink)" }}
              >
                Emergency number
              </label>
              <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                Shown on the citizen report header for life-safety issues.
              </span>
            </div>
            <div style={{ maxWidth: "360px" }}>
              <input
                id="setting-emergency-phone"
                type="text"
                value={formData.emergency_number}
                onChange={(e) => updateField("emergency_number", e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  fontSize: "0.875rem",
                  borderRadius: "var(--radius-sm)",
                  border: `1px solid ${fieldErrors.emergency_number ? "var(--danger)" : "var(--border)"}`,
                }}
              />
              {fieldErrors.emergency_number && (
                <p style={{ margin: "4px 0 0", fontSize: "0.75rem", color: "var(--danger)" }}>
                  {fieldErrors.emergency_number}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: Response Times */}
      <section style={{ marginBottom: "36px" }}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--text-ink)", margin: "0 0 4px 0" }}>
          Response times
        </h2>
        <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", margin: "0 0 16px 0" }}>
          Target resolution schedules and early warning windows.
        </p>

        <div style={{ borderTop: "1px solid var(--border-subtle, #e2e8f0)" }}>
          {/* Default fix time */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "clamp(220px, 30%, 300px) 1fr",
              gap: "24px",
              padding: "16px 0",
              borderBottom: "1px solid var(--border-subtle, #e2e8f0)",
              alignItems: "start",
            }}
          >
            <div>
              <label
                htmlFor="setting-default-hours"
                style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, color: "var(--text-ink)" }}
              >
                Default fix time
              </label>
              <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                Base target resolution deadline for unassigned categories.
              </span>
            </div>
            <div style={{ maxWidth: "360px", display: "flex", alignItems: "center", gap: "10px" }}>
              <input
                id="setting-default-hours"
                type="number"
                min={1}
                max={720}
                value={formData.default_target_hours}
                onChange={(e) => updateField("default_target_hours", parseInt(e.target.value) || 0)}
                style={{
                  width: "100px",
                  padding: "8px 12px",
                  fontSize: "0.875rem",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                }}
              />
              <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>hours</span>
            </div>
          </div>

          {/* Warn before due */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "clamp(220px, 30%, 300px) 1fr",
              gap: "24px",
              padding: "16px 0",
              borderBottom: "1px solid var(--border-subtle, #e2e8f0)",
              alignItems: "start",
            }}
          >
            <div>
              <label
                htmlFor="setting-warn-hours"
                style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, color: "var(--text-ink)" }}
              >
                Warn before due
              </label>
              <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                Hours remaining before deadline when Due Soon status is triggered.
              </span>
            </div>
            <div style={{ maxWidth: "360px", display: "flex", alignItems: "center", gap: "10px" }}>
              <input
                id="setting-warn-hours"
                type="number"
                min={1}
                max={168}
                value={formData.warn_before_due_hours}
                onChange={(e) => updateField("warn_before_due_hours", parseInt(e.target.value) || 0)}
                style={{
                  width: "100px",
                  padding: "8px 12px",
                  fontSize: "0.875rem",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                }}
              />
              <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>hours</span>
            </div>
          </div>

          {/* Link to Categories table */}
          <div style={{ padding: "14px 0", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
            Category-specific first response and fix targets are configured on the{" "}
            <button
              type="button"
              onClick={onNavigateToCategories}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                color: "var(--brand-primary, #0284c7)",
                textDecoration: "underline",
                cursor: "pointer",
                fontWeight: 500,
                fontSize: "inherit",
              }}
            >
              Categories tab
            </button>
            .
          </div>
        </div>
      </section>

      {/* SECTION 3: Emails */}
      <section style={{ marginBottom: "36px" }}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--text-ink)", margin: "0 0 4px 0" }}>
          Emails
        </h2>
        <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", margin: "0 0 16px 0" }}>
          Automated email notifications sent to citizens and field staff.
        </p>

        <div style={{ borderTop: "1px solid var(--border-subtle, #e2e8f0)" }}>
          {/* Report updates */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "clamp(220px, 30%, 300px) 1fr",
              gap: "24px",
              padding: "16px 0",
              borderBottom: "1px solid var(--border-subtle, #e2e8f0)",
              alignItems: "center",
            }}
          >
            <div>
              <span style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, color: "var(--text-ink)" }}>
                Report updates
              </span>
              <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                Notify residents when their report status changes or an officer adds a note.
              </span>
            </div>
            <div>
              <Switch
                id="sw-report-updates"
                checked={formData.email_report_updates}
                onChange={(c) => updateField("email_report_updates", c)}
                label="Toggle report update emails"
              />
            </div>
          </div>

          {/* New jobs */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "clamp(220px, 30%, 300px) 1fr",
              gap: "24px",
              padding: "16px 0",
              borderBottom: "1px solid var(--border-subtle, #e2e8f0)",
              alignItems: "center",
            }}
          >
            <div>
              <span style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, color: "var(--text-ink)" }}>
                New jobs
              </span>
              <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                Send work assignments directly to field worker email addresses.
              </span>
            </div>
            <div>
              <Switch
                id="sw-new-jobs"
                checked={formData.email_new_jobs}
                onChange={(c) => updateField("email_new_jobs", c)}
                label="Toggle new job assignment emails"
              />
            </div>
          </div>

          {/* Invites */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "clamp(220px, 30%, 300px) 1fr",
              gap: "24px",
              padding: "16px 0",
              borderBottom: "1px solid var(--border-subtle, #e2e8f0)",
              alignItems: "center",
            }}
          >
            <div>
              <span style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, color: "var(--text-ink)" }}>
                Staff invites
              </span>
              <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                Send secure activation links to newly invited municipal personnel.
              </span>
            </div>
            <div>
              <Switch
                id="sw-invites"
                checked={formData.email_invites}
                onChange={(c) => updateField("email_invites", c)}
                label="Toggle staff invite emails"
              />
            </div>
          </div>

          {/* Name shown on emails */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "clamp(220px, 30%, 300px) 1fr",
              gap: "24px",
              padding: "16px 0",
              borderBottom: "1px solid var(--border-subtle, #e2e8f0)",
              alignItems: "start",
            }}
          >
            <div>
              <label
                htmlFor="setting-sender-name"
                style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, color: "var(--text-ink)" }}
              >
                Name shown on emails
              </label>
              <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                Appears in the email signature and From header.
              </span>
            </div>
            <div style={{ maxWidth: "360px" }}>
              <input
                id="setting-sender-name"
                type="text"
                value={formData.email_sender_name}
                onChange={(e) => updateField("email_sender_name", e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  fontSize: "0.875rem",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 4: Suggestions */}
      <section style={{ marginBottom: "36px" }}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--text-ink)", margin: "0 0 4px 0" }}>
          Suggestions
        </h2>
        <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", margin: "0 0 16px 0" }}>
          Assistive software hints for review officers. Suggestions never alter status automatically.
        </p>

        <div style={{ borderTop: "1px solid var(--border-subtle, #e2e8f0)" }}>
          {/* Photo check */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "clamp(220px, 30%, 300px) 1fr",
              gap: "24px",
              padding: "16px 0",
              borderBottom: "1px solid var(--border-subtle, #e2e8f0)",
              alignItems: "center",
            }}
          >
            <div>
              <span style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, color: "var(--text-ink)" }}>
                Photo check
              </span>
              <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                Looks at report photos and tells officers what they seem to show.
              </span>
            </div>
            <div>
              <Switch
                id="sw-photo-check"
                checked={formData.photo_check_enabled}
                onChange={(c) => updateField("photo_check_enabled", c)}
                label="Toggle photo check"
              />
            </div>
          </div>

          {/* Possible duplicates */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "clamp(220px, 30%, 300px) 1fr",
              gap: "24px",
              padding: "16px 0",
              borderBottom: "1px solid var(--border-subtle, #e2e8f0)",
              alignItems: "center",
            }}
          >
            <div>
              <span style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, color: "var(--text-ink)" }}>
                Possible duplicates
              </span>
              <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                Finds similar reports nearby so officers can link them.
              </span>
            </div>
            <div>
              <Switch
                id="sw-duplicate-match"
                checked={formData.duplicate_match_enabled}
                onChange={(c) => updateField("duplicate_match_enabled", c)}
                label="Toggle duplicate matching"
              />
            </div>
          </div>

          {/* Suggested priority */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "clamp(220px, 30%, 300px) 1fr",
              gap: "24px",
              padding: "16px 0",
              borderBottom: "1px solid var(--border-subtle, #e2e8f0)",
              alignItems: "center",
            }}
          >
            <div>
              <span style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, color: "var(--text-ink)" }}>
                Suggested priority
              </span>
              <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                Recommends urgency based on hazard type and deadline.
              </span>
            </div>
            <div>
              <Switch
                id="sw-priority-engine"
                checked={formData.priority_suggestion_enabled}
                onChange={(c) => updateField("priority_suggestion_enabled", c)}
                label="Toggle suggested priority"
              />
            </div>
          </div>

          {/* Photo hint for residents */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "clamp(220px, 30%, 300px) 1fr",
              gap: "24px",
              padding: "16px 0",
              borderBottom: "1px solid var(--border-subtle, #e2e8f0)",
              alignItems: "center",
            }}
          >
            <div>
              <span style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, color: "var(--text-ink)" }}>
                Photo hint for residents
              </span>
              <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                Shows residents a category suggestion when they add a photo.
              </span>
            </div>
            <div>
              <Switch
                id="sw-photo-hint"
                checked={formData.citizen_photo_hint_enabled}
                onChange={(c) => updateField("citizen_photo_hint_enabled", c)}
                label="Toggle citizen photo hint"
              />
            </div>
          </div>

          {/* Check photos for edits */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "clamp(220px, 30%, 300px) 1fr",
              gap: "24px",
              padding: "16px 0",
              borderBottom: "1px solid var(--border-subtle, #e2e8f0)",
              alignItems: "center",
            }}
          >
            <div>
              <span style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, color: "var(--text-ink)" }}>
                Check photos for edits
              </span>
              <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                Looks for editing metadata and camera timestamps.
              </span>
            </div>
            <div>
              <Switch
                id="sw-photo-authenticity"
                checked={formData.photo_authenticity_enabled}
                onChange={(c) => updateField("photo_authenticity_enabled", c)}
                label="Toggle photo authenticity inspection"
              />
            </div>
          </div>
        </div>

        {/* 30-Day Decision Table */}
        <div style={{ marginTop: "24px" }}>
          <h3 style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-ink)", margin: "0 0 10px 0" }}>
            Officer decisions in the last 30 days
          </h3>
          <div
            style={{
              border: "1px solid var(--border-subtle, #e2e8f0)",
              borderRadius: "var(--radius-sm)",
              overflow: "hidden",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
              <thead>
                <tr style={{ backgroundColor: "var(--bg-subtle)", borderBottom: "1px solid var(--border-subtle, #e2e8f0)", textAlign: "left" }}>
                  <th style={{ padding: "10px 16px", fontWeight: 600, color: "var(--text-secondary)" }}>Feature</th>
                  <th style={{ padding: "10px 16px", fontWeight: 600, color: "var(--text-secondary)" }}>Shown</th>
                  <th style={{ padding: "10px 16px", fontWeight: 600, color: "var(--text-secondary)" }}>Agreed</th>
                  <th style={{ padding: "10px 16px", fontWeight: 600, color: "var(--text-secondary)" }}>Not right</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const stats = suggestionSummary?.feature_stats || [
                    {
                      feature: "Photo check",
                      shown: suggestionSummary?.stats_30_days?.suggestions_made || 0,
                      agreed: suggestionSummary?.stats_30_days?.looks_right_count || 0,
                      not_right: suggestionSummary?.stats_30_days?.not_right_count || 0,
                    },
                    { feature: "Possible duplicates", shown: 0, agreed: 0, not_right: 0 },
                    { feature: "Suggested priority", shown: 0, agreed: 0, not_right: 0 },
                    { feature: "Check photos for edits", shown: 0, agreed: 0, not_right: 0 },
                  ];

                  const totalShown = stats.reduce((acc: number, s: any) => acc + (s.shown || 0), 0);
                  if (totalShown === 0) {
                    return (
                      <tr>
                        <td colSpan={4} style={{ padding: "20px 16px", textAlign: "center", color: "var(--text-muted)" }}>
                          No suggestions yet
                        </td>
                      </tr>
                    );
                  }

                  return stats.map((row: any) => (
                    <tr key={row.feature} style={{ borderBottom: "1px solid var(--border-subtle, #e2e8f0)" }}>
                      <td style={{ padding: "10px 16px", fontWeight: 500, color: "var(--text-ink)" }}>{row.feature}</td>
                      <td style={{ padding: "10px 16px", color: "var(--text-ink)" }}>{row.shown}</td>
                      <td style={{ padding: "10px 16px", color: "var(--success, #16a34a)" }}>{row.agreed}</td>
                      <td style={{ padding: "10px 16px", color: "var(--text-muted)" }}>{row.not_right}</td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* SECTION 5: Alerts */}
      <section style={{ marginBottom: "36px" }}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--text-ink)", margin: "0 0 4px 0" }}>
          Alerts
        </h2>
        <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", margin: "0 0 16px 0" }}>
          Real-time escalation broadcasts to senior authorities.
        </p>

        <div style={{ borderTop: "1px solid var(--border-subtle, #e2e8f0)" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "clamp(220px, 30%, 300px) 1fr",
              gap: "24px",
              padding: "16px 0",
              borderBottom: "1px solid var(--border-subtle, #e2e8f0)",
              alignItems: "center",
            }}
          >
            <div>
              <span style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, color: "var(--text-ink)" }}>
                Senior deadline pop-up
              </span>
              <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                Show a pop-up to senior authorities when a deadline is missed.
              </span>
            </div>
            <div>
              <Switch
                id="sw-senior-alert"
                checked={formData.senior_alert_popup_enabled}
                onChange={(c) => updateField("senior_alert_popup_enabled", c)}
                label="Toggle senior alert pop-up"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Per-section Save Button / Inline Status */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "16px" }}>
        <button
          type="button"
          className="btn-primary"
          onClick={handleSave}
          disabled={saving || !hasUnsavedChanges}
          style={{ minHeight: "38px", padding: "8px 20px" }}
        >
          {saving ? "Saving..." : savedInline ? "Saved" : "Save settings"}
        </button>
        {savedInline && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "0.8125rem", color: "var(--success, #16a34a)" }}>
            <Check size={16} /> Saved
          </span>
        )}
      </div>

      {/* Plain Footer with Credits link */}
      <footer style={{ marginTop: "48px", paddingTop: "20px", borderTop: "1px solid var(--border-subtle, #e2e8f0)", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
        <span>GrievanceGrid Municipal Administration. </span>
        <Link href="/credits" className="text-[var(--brand-primary)] hover:underline">
          Photographic Credits &amp; Attribution
        </Link>
      </footer>
    </div>
  );
}

export default AdminSettingsPane;
