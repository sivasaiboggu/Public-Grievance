import React from "react";
import Link from "next/link";

export default function NotFound() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "65vh",
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
          <path d="M16 16s-1.5-2-4-2-4 2-4 2" />
          <line x1="9" y1="9" x2="9.01" y2="9" />
          <line x1="15" y1="9" x2="15.01" y2="9" />
        </svg>
      </div>

      <h1 style={{ fontSize: "1.25rem", fontWeight: 600, color: "var(--color-text, #111315)", margin: "0 0 8px 0" }}>
        Page not found
      </h1>
      <p style={{ fontSize: "0.9375rem", color: "var(--color-text-muted, #5B5F66)", margin: "0 0 24px 0", maxWidth: "420px" }}>
        The page you are looking for does not exist or may have been moved.
      </p>

      <Link
        href="/"
        style={{
          backgroundColor: "var(--color-primary, #1D4ED8)",
          color: "#ffffff",
          padding: "8px 16px",
          borderRadius: "6px",
          textDecoration: "none",
          fontWeight: 500,
          fontSize: "0.875rem",
        }}
      >
        Go back home
      </Link>
    </div>
  );
}
