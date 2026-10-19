"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { Wordmark } from "../../../components/Wordmark";
import { AuthPhotoPane } from "../../../components/AuthPhotoPane";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);

    try {
      await fetch("/api/v1/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      setSubmitted(true);
    } catch {
      setSubmitted(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-split-wrapper">
      <AuthPhotoPane />

      <div className="auth-form-pane">
        <div className="auth-form-card">
          <div className="mobile-only-wordmark" style={{ marginBottom: "20px" }}>
            <Wordmark size={22} />
          </div>

          {submitted ? (
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "50%",
                  backgroundColor: "rgba(16, 185, 129, 0.12)",
                  color: "var(--success, #10b981)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 16px",
                }}
              >
                <CheckCircle2 size={24} />
              </div>
              <h1 style={{ fontSize: "1.35rem", fontWeight: 700, margin: "0 0 8px 0" }}>Check your inbox</h1>
              <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", margin: "0 0 24px 0", lineHeight: 1.5 }}>
                If an account exists with that email address, we have sent instructions to reset your password. The link is valid for 30 minutes.
              </p>
              <Link href="/sign-in" className="btn-secondary" style={{ display: "inline-flex", width: "100%", justifyContent: "center" }}>
                Return to sign in
              </Link>
            </div>
          ) : (
            <div>
              <div style={{ marginBottom: "24px" }}>
                <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: "0 0 6px 0" }}>Reset password</h1>
                <p className="text-muted" style={{ margin: 0, fontSize: "0.875rem" }}>
                  Enter your email address and we will send you a link to reset your password.
                </p>
              </div>

              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                <div className="form-group">
                  <label htmlFor="reset-email">Email address</label>
                  <input
                    id="reset-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    disabled={busy}
                  />
                </div>

                <button type="submit" disabled={busy} className="btn-primary" style={{ width: "100%", minHeight: "44px" }}>
                  {busy ? "Sending link..." : "Send reset link"}
                </button>
              </form>

              <div style={{ marginTop: "24px", textAlign: "center" }}>
                <Link href="/sign-in" style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.875rem", color: "var(--primary)", textDecoration: "none" }}>
                  <ArrowLeft size={16} />
                  <span>Back to sign in</span>
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
