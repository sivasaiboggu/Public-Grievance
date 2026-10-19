"use client";

import React from "react";
import { StatusChip } from "./StatusChip";
import { type Status } from "@grievancegrid/api-client";

export interface ReportRowData {
  id: string;
  tracking_id: string;
  title: string;
  status: Status;
  category: string;
  location_text?: string;
  area_name?: string;
  received_at: string;
  updated_at?: string;
  isOverdue?: boolean;
  dueText?: string;
  clusterCount?: number;
}

interface ReportRowProps {
  report: ReportRowData;
  isSelected?: boolean;
  onSelect: () => void;
}

export function ReportRow({ report, isSelected, onSelect }: ReportRowProps) {
  const displayLocation = report.area_name || report.location_text || "Kochi";

  return (
    <div
      role="option"
      aria-selected={isSelected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      style={{
        width: "100%",
        boxSizing: "border-box",
        textAlign: "left",
        padding: "10px 14px",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        minWidth: 0,
        backgroundColor: isSelected
          ? "var(--primary-subtle, rgba(29, 78, 216, 0.08))"
          : "transparent",
        borderLeft: isSelected ? "3px solid var(--primary, #1d4ed8)" : "3px solid transparent",
        borderBottom: "1px solid var(--border-subtle, #e2e8f0)",
        transition: "background-color 100ms ease",
        outline: "none",
        userSelect: "none",
      }}
      className="report-row-item"
    >
      {/* Line 1: Code and Status Chip */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
          width: "100%",
          minWidth: 0,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono, monospace)",
            fontSize: "12px",
            color: "var(--text-muted, #64748b)",
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "0.02em",
            flexShrink: 0,
          }}
        >
          {report.tracking_id}
        </span>
        <div style={{ display: "flex", gap: "6px", alignItems: "center", flexShrink: 0 }}>
          {report.clusterCount && report.clusterCount > 1 ? (
            <span
              style={{
                fontSize: "11px",
                fontWeight: 500,
                padding: "1px 6px",
                borderRadius: "9999px",
                backgroundColor: "var(--bg-subtle, #f1f5f9)",
                border: "1px solid var(--border, #cbd5e1)",
                color: "var(--text-muted, #475569)",
                whiteSpace: "nowrap",
              }}
            >
              +{report.clusterCount - 1} similar nearby
            </span>
          ) : null}
          <StatusChip status={report.status} />
        </div>
      </div>

      {/* Line 2: Title (14px 600, single line ellipsis, left aligned) */}
      <div
        style={{
          fontSize: "14px",
          fontWeight: 600,
          color: "var(--text-ink, #0f172a)",
          lineHeight: "1.35",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          width: "100%",
          minWidth: 0,
          textAlign: "left",
          wordBreak: "break-all",
        }}
        title={report.title}
      >
        {report.title}
      </div>

      {/* Line 3: Area, visible gap, then due text */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          width: "100%",
          minWidth: 0,
          fontSize: "12px",
        }}
      >
        <span
          style={{
            color: "var(--text-muted, #64748b)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            flex: 1,
            minWidth: 0,
            textAlign: "left",
          }}
          title={displayLocation}
        >
          {displayLocation}
        </span>
        {report.dueText && (
          <span
            style={{
              flexShrink: 0,
              whiteSpace: "nowrap",
              fontWeight: report.isOverdue ? 600 : 400,
              color: report.isOverdue
                ? "var(--priority-high, #C2540A)"
                : "var(--text-muted, #64748b)",
            }}
          >
            {report.dueText}
          </span>
        )}
      </div>
    </div>
  );
}
