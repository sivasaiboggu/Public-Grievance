"use client";

import React, { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global application error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          backgroundColor: "#F8F9FA",
          color: "#111315",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
        }}
      >
        <div
          style={{
            maxWidth: "480px",
            padding: "32px 24px",
            backgroundColor: "#FFFFFF",
            borderRadius: "8px",
            border: "1px solid #E2E4E8",
            textAlign: "center",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600, margin: "0 0 8px 0" }}>
            Something went wrong on this page.
          </h1>
          <p style={{ fontSize: "0.9375rem", color: "#5B5F66", margin: "0 0 24px 0", lineHeight: 1.5 }}>
            We encountered a problem while displaying this page. Try reloading or return home.
          </p>
          <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
            <button
              onClick={() => reset()}
              style={{
                backgroundColor: "#1D4ED8",
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
                color: "#111315",
                padding: "8px 16px",
                borderRadius: "6px",
                border: "1px solid #E2E4E8",
                textDecoration: "none",
                fontWeight: 500,
                fontSize: "0.875rem",
              }}
            >
              Go back home
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
