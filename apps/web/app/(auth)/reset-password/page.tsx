"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Lock } from "lucide-react";
import { Wordmark } from "../../../components/Wordmark";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 12) {
      setError("Password must be at least 12 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!token) {
      setError("Reset token is missing from this link. Please request a new one.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/v1/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: password }),
      });

      if (res.ok) {
        setSuccess(true);
      } else {
        const err = await res.json();
        setError(err.detail || "Reset link is invalid or has expired.");
      }
    } catch {
      setError("Could not connect to server. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ width: "100%", maxWidth: "420px", padding: "32px 28px" }}>
      <div style={{ marginBottom: "24px", textAlign: "center" }}>
        <Wordmark size={24} />
      </div>

      {success ? (
        <div style={{ textAlign: "center" }}>
          <div style={{ width: "48px", height: "48px", borderRadius: "50%", backgroundColor: "#dcfce7", color: "#16a34a", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <CheckCircle2 size={24} />
          </div>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700, margin: "0 0 8px 0" }}>Password updated</h1>
          <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", margin: "0 0 24px 0" }}>
            Your password has been changed. You can now sign in with your new credentials.
          </p>
          <Link href="/sign-in" className="btn-primary" style={{ display: "inline-flex", width: "100%", justifyContent: "center" }}>
            Sign in
          </Link>
        </div>
      ) : (
        <div>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700, margin: "0 0 6px 0" }}>Set new password</h1>
          <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", margin: "0 0 20px 0" }}>
            Choose a new password for your account (at least 12 characters).
          </p>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label className="field-label" htmlFor="new-pw">New password</label>
              <input
                id="new-pw"
                type="password"
                className="field-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={12}
              />
            </div>

            <div>
              <label className="field-label" htmlFor="confirm-new-pw">Confirm new password</label>
              <input
                id="confirm-new-pw"
                type="password"
                className="field-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <div style={{ fontSize: "0.8125rem", color: "var(--color-danger, #ef4444)", fontWeight: 500 }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={busy} className="btn-primary" style={{ width: "100%", minHeight: "40px" }}>
              {busy ? "Updating..." : "Update password"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", backgroundColor: "var(--color-background-subtle, #f8fafc)" }}>
      <Suspense fallback={<div className="card" style={{ padding: "32px", width: "100%", maxWidth: "420px" }}>Loading...</div>}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
