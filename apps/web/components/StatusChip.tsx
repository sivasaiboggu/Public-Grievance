import React from "react";
import type { Status } from "@grievancegrid/api-client";
import { PLAIN_STATUS_LABELS, STATUS_DOT_COLORS } from "../lib/labels";

interface StatusChipProps {
  status: Status | string;
  className?: string;
}

export function StatusChip({ status, className = "" }: StatusChipProps) {
  const displayLabel = PLAIN_STATUS_LABELS[status as Status] || status.replace(/_/g, " ");
  const dotColor = STATUS_DOT_COLORS[status as Status] || "var(--text-muted)";

  return (
    <span
      className={`status-chip ${className}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        fontSize: "0.8125rem",
        fontWeight: 500,
        color: "var(--text-ink)",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: "7px",
          height: "7px",
          borderRadius: "50%",
          backgroundColor: dotColor,
          flexShrink: 0,
        }}
      />
      <span>{displayLabel}</span>
    </span>
  );
}
