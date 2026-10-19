import React from "react";
import Link from "next/link";

interface WordmarkProps {
  href?: string;
  size?: number;
  inverted?: boolean;
}

export function GridMarkIcon({ size = 20, color = "#1D4ED8" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <rect x="3" y="3" width="8" height="8" rx="2" />
      <rect x="13" y="3" width="8" height="8" rx="2" />
      <rect x="3" y="13" width="8" height="8" rx="2" />
      <rect x="13" y="13" width="8" height="8" rx="2" />
    </svg>
  );
}

export function Wordmark({ href, size = 20, inverted = false }: WordmarkProps) {
  const content = (
    <span className="brand-wrap" style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
      <GridMarkIcon size={size} color={inverted ? "#FFFFFF" : "#1D4ED8"} />
      <span className="brand-title" style={{ color: inverted ? "#FFFFFF" : "var(--text-ink)" }}>
        <strong>Grievance</strong>
        <span>Grid</span>
      </span>
    </span>
  );

  if (href) {
    return (
      <Link href={href} style={{ textDecoration: "none" }}>
        {content}
      </Link>
    );
  }

  return content;
}
