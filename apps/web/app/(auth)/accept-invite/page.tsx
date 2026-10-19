"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Wordmark } from "../../../components/Wordmark";
import { AuthPhotoPane } from "../../../components/AuthPhotoPane";
import { getRoleHomePath, getStoredAuth, saveStoredAuth } from "../../../lib/auth";

function AcceptInviteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [name, setName] = useState("");
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
      setError("Invitation link is missing an activation token.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/v1/auth/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          new_password: password,
          name: name.trim() || undefined,
        }),
      });

      if (res.ok) {
        const authData = await res.json();
        if (authData.access_token && authData.user) {
          saveStoredAuth(authData);
          setSuccess(true);
          const target = getRoleHomePath(authData.user.role);
          setTimeout(() => {
            router.push(target);
          }, 1500);
        } else {
          setSuccess(true);
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.detail || "Invitation could not be accepted. It may be expired or already used.");
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-form-card">
      <div className="mobile-only-wordmark" style={{ marginBottom: "20px" }}>
        <Wordmark size={22} />
      </div>

      {success ? (
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
          <h1 style={{ fontSize: "1.35rem", fontWeight: 700, margin: "0 0 8px 0" }}>Account activated</h1>
          <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", margin: "0 0 24px 0", lineHeight: 1.5 }}>
            Your account is ready. Taking you to your workspace...
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              const currentAuth = getStoredAuth();
              router.push(currentAuth?.user?.role ? getRoleHomePath(currentAuth.user.role) : "/sign-in");
            }}
            style={{ display: "inline-flex", width: "100%", justifyContent: "center", minHeight: "44px" }}
          >
            Go to workspace
          </button>
        </div>
      ) : (
        <div>
          <div style={{ marginBottom: "24px" }}>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: "0 0 6px 0" }}>Staff account setup</h1>
            <p className="text-muted" style={{ margin: 0, fontSize: "0.875rem" }}>
              An administrator has invited you to GrievanceGrid. Choose a password to activate your account.
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div className="form-group">
              <label htmlFor="staff-name">Confirm your full name (optional)</label>
              <input
                id="staff-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Leave blank to keep existing name"
                disabled={busy}
              />
            </div>

            <div className="form-group">
              <label htmlFor="staff-pw">Choose a password</label>
              <input
                id="staff-pw"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={12}
                placeholder="At least 12 characters"
                disabled={busy}
              />
            </div>

            <div className="form-group">
              <label htmlFor="staff-confirm-pw">Confirm password</label>
              <input
                id="staff-confirm-pw"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={busy}
              />
            </div>

            {error && (
              <div role="alert" className="banner banner-error" style={{ fontSize: "0.875rem" }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={busy} className="btn-primary" style={{ width: "100%", minHeight: "44px" }}>
              {busy ? "Activating..." : "Activate account"}
            </button>
          </form>

          <div style={{ marginTop: "24px", textAlign: "center" }}>
            <Link href="/sign-in" style={{ fontSize: "0.875rem", color: "var(--primary)", textDecoration: "none" }}>
              Return to sign in
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <div className="auth-split-wrapper">
      <AuthPhotoPane />
      <div className="auth-form-pane">
        <Suspense fallback={<div className="auth-form-card" style={{ padding: "32px", textAlign: "center" }}>Loading...</div>}>
          <AcceptInviteForm />
        </Suspense>
      </div>
    </div>
  );
}
