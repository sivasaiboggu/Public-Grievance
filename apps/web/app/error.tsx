"use client";

import React, { useEffect } from "react";
import Link from "next/link";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the technical error to console only, keeping UI calm
    console.error("Page error:", error);
  }, [error]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        padding: "32px 16px",
        textAlign: "center",
        fontFamily: "var(--font-sans, system-ui, sans-serif)",
      }}
    >
      <div
        style={{
          width: "48px",
          height: "48px",
          borderRadius: "50%",
          backgroundColor: "var(--color-bg-subtle, #F4F5F7)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "16px",
          color: "var(--color-text-muted, #5B5F66)",
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>

      <h1 style={{ fontSize: "1.25rem", fontWeight: 600, color: "var(--color-text, #111315)", margin: "0 0 8px 0" }}>
        Something went wrong on this page.
      </h1>
      <p style={{ fontSize: "0.9375rem", color: "var(--color-text-muted, #5B5F66)", margin: "0 0 24px 0", maxWidth: "420px" }}>
        We ran into an unexpected problem. You can try loading the page again or return to your reports.
      </p>

      <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
        <button
          onClick={() => reset()}
          style={{
            backgroundColor: "var(--color-primary, #1D4ED8)",
            color: "#ffffff",
            padding: "8px 16px",
            borderRadius: "6px",
            border: "none",
            fontWeight: 500,
            fontSize: "0.875rem",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
        <Link
          href="/"
          style={{
            color: "var(--color-text, #111315)",
            padding: "8px 16px",
            borderRadius: "6px",
            border: "1px solid var(--color-border, #E2E4E8)",
            textDecoration: "none",
            fontWeight: 500,
            fontSize: "0.875rem",
          }}
        >
          Go back home
        </Link>
      </div>
    </div>
  );
}
