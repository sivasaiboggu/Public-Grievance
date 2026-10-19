"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Wordmark } from "../../../components/Wordmark";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [busy, setBusy] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("No verification token was provided.");
      setBusy(false);
      return;
    }

    const verify = async () => {
      try {
        const res = await fetch("/api/v1/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        if (res.ok) {
          setSuccess(true);
        } else {
          const err = await res.json();
          setError(err.detail || "Verification link is invalid or has expired.");
        }
      } catch {
        setError("Could not connect to server. Please try again.");
      } finally {
        setBusy(false);
      }
    };

    verify();
  }, [token]);

  return (
    <div className="card" style={{ width: "100%", maxWidth: "420px", padding: "32px 28px", textAlign: "center" }}>
      <div style={{ marginBottom: "24px" }}>
        <Wordmark size={24} />
      </div>

      {busy ? (
        <div>
          <div className="skeleton" style={{ width: "48px", height: "48px", borderRadius: "50%", margin: "0 auto 16px" }} />
          <h1 style={{ fontSize: "1.125rem", fontWeight: 600 }}>Verifying your email...</h1>
        </div>
      ) : success ? (
        <div>
          <div style={{ width: "48px", height: "48px", borderRadius: "50%", backgroundColor: "#dcfce7", color: "#16a34a", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <CheckCircle2 size={24} />
          </div>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700, margin: "0 0 8px 0" }}>Email verified</h1>
          <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", margin: "0 0 24px 0" }}>
            Your email has been verified. You can now submit reports and track public service progress.
          </p>
          <Link href="/citizen" className="btn-primary" style={{ display: "inline-flex", width: "100%", justifyContent: "center" }}>
            Go to my reports
          </Link>
        </div>
      ) : (
        <div>
          <div style={{ width: "48px", height: "48px", borderRadius: "50%", backgroundColor: "#fee2e2", color: "#dc2626", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <AlertCircle size={24} />
          </div>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700, margin: "0 0 8px 0" }}>Verification failed</h1>
          <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", margin: "0 0 24px 0" }}>
            {error}
          </p>
          <Link href="/sign-in" className="btn-secondary" style={{ display: "inline-flex", width: "100%", justifyContent: "center" }}>
            Return to sign in
          </Link>
        </div>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", backgroundColor: "var(--color-background-subtle, #f8fafc)" }}>
      <Suspense fallback={<div className="card" style={{ padding: "32px", width: "100%", maxWidth: "420px" }}>Loading...</div>}>
        <VerifyEmailContent />
      </Suspense>
    </div>
  );
}
