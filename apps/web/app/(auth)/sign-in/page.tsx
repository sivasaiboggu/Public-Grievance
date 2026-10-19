"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, AlertCircle } from "lucide-react";
import { ApiError } from "@grievancegrid/api-client";
import { Wordmark } from "../../../components/Wordmark";
import { AuthPhotoPane } from "../../../components/AuthPhotoPane";
import { getApiClient } from "../../../lib/api";
import { getRoleHomePath, getStoredAuth, saveStoredAuth } from "../../../lib/auth";

const DEMO_ACCOUNTS = [
  { label: "Citizen (Aarav Sharma)", email: "citizen@grievancegrid.test", pass: "Citizen@12345" },
  { label: "Officer (Priya Patel)", email: "officer@grievancegrid.test", pass: "Officer@12345" },
  { label: "Field worker (Rajesh Kumar)", email: "field@grievancegrid.test", pass: "Field@12345" },
  { label: "Senior authority (S. Ramanathan)", email: "senior@grievancegrid.test", pass: "Senior@12345" },
  { label: "Admin (System Administrator)", email: "admin@grievancegrid.test", pass: "Admin@12345" },
];

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [showDevMenu, setShowDevMenu] = useState(false);

  // If already authenticated, redirect to role home
  useEffect(() => {
    const auth = getStoredAuth();
    if (auth?.user?.role) {
      router.replace(getRoleHomePath(auth.user.role));
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    const errors: { email?: string; password?: string } = {};
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      errors.email = "Please enter your email address.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errors.email = "Please enter a valid email address.";
    }

    if (!password) {
      errors.password = "Please enter your password.";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormError("Please check the fields below and try again.");
      return;
    }

    setFieldErrors({});
    setBusy(true);

    try {
      const client = getApiClient();
      const res = await client.login(trimmedEmail, password);
      saveStoredAuth(res);
      router.push(getRoleHomePath(res.user.role));
    } catch (err: unknown) {
      let msg = "Could not sign in. Check your email and password, then try again.";
      if (err instanceof ApiError) {
        msg = err.message;
      } else if (err instanceof Error) {
        msg = err.message;
      }
      setFormError(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleSelectDemo = (acc: (typeof DEMO_ACCOUNTS)[0]) => {
    setEmail(acc.email);
    setPassword(acc.pass);
    setFieldErrors({});
    setFormError("");
    setShowDevMenu(false);
  };

  useEffect(() => {
    document.title = "Public GrievanceGrid";
  }, []);

  return (
    <div className="auth-split-wrapper">
      {/* Left Column: Full-height Edge-to-Edge Street Photo Panel */}
      <AuthPhotoPane />

      {/* Right Column: Centered Sign-In Form (max-width 400px) */}
      <div className="auth-form-pane">
        <div className="auth-form-card">
          {/* Wordmark shown on mobile only */}
          <div className="mobile-only-wordmark" style={{ marginBottom: "20px" }}>
            <Wordmark size={22} />
          </div>

          <div style={{ marginBottom: "24px" }}>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 600, margin: "0 0 6px" }}>Sign in</h2>
            <p className="text-muted" style={{ margin: 0, fontSize: "0.875rem" }}>
              Welcome back.
            </p>
          </div>

          {formError && (
            <div role="alert" className="banner banner-error" style={{ marginBottom: "20px" }}>
              <AlertCircle size={18} style={{ flexShrink: 0, marginTop: "2px" }} />
              <span>{formError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div className="form-group">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
                }}
                disabled={busy}
                style={{ borderColor: fieldErrors.email ? "var(--error)" : undefined }}
              />
              {fieldErrors.email && <span className="field-error">{fieldErrors.email}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <div style={{ position: "relative" }}>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
                  }}
                  disabled={busy}
                  style={{
                    paddingRight: "46px",
                    borderColor: fieldErrors.password ? "var(--error)" : undefined,
                  }}
                />
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: "absolute",
                    right: 4,
                    top: "50%",
                    transform: "translateY(-50%)",
                    minHeight: "40px",
                    width: "40px",
                    padding: 0,
                  }}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "4px" }}>
                <Link
                  href="/forgot-password"
                  style={{
                    fontSize: "0.8125rem",
                    color: "var(--color-primary, #2563eb)",
                    textDecoration: "none",
                  }}
                >
                  Forgot password?
                </Link>
              </div>
              {fieldErrors.password && <span className="field-error">{fieldErrors.password}</span>}
            </div>

            {/* Sign in button is always enabled, validates on submit */}
            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy}
              style={{ width: "100%", marginTop: "6px" }}
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>

          {/* Quiet test account link (Development builds only) */}
          {process.env.NODE_ENV !== "production" && (
            <div style={{ marginTop: "16px", textAlign: "center" }}>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setShowDevMenu((prev) => !prev)}
                style={{
                  fontSize: "0.8125rem",
                  color: "var(--text-muted)",
                  padding: "4px 8px",
                  minHeight: "32px",
                  textDecoration: "underline",
                  cursor: "pointer",
                }}
              >
                Use a test account
              </button>

              {showDevMenu && (
                <div
                  style={{
                    marginTop: "8px",
                    padding: "8px",
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    textAlign: "left",
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                    boxShadow: "var(--shadow-sm)",
                  }}
                >
                  {DEMO_ACCOUNTS.map((acc) => (
                    <button
                      key={acc.email}
                      type="button"
                      onClick={() => handleSelectDemo(acc)}
                      style={{
                        padding: "8px 10px",
                        textAlign: "left",
                        background: "transparent",
                        border: "none",
                        borderRadius: "var(--radius-sm)",
                        cursor: "pointer",
                        fontSize: "0.8125rem",
                        color: "var(--text-ink)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.background = "var(--bg-subtle)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.background = "transparent";
                      }}
                    >
                      <span style={{ fontWeight: 500 }}>{acc.label}</span>
                      <span className="text-muted" style={{ fontSize: "0.75rem" }}>{acc.email}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: "24px", paddingTop: "20px", borderTop: "1px solid var(--border)", textAlign: "center" }}>
            <Link
              href="/sign-up"
              style={{ fontSize: "0.875rem", color: "var(--primary)", textDecoration: "none", fontWeight: 500 }}
            >
              New citizen? Create an account
            </Link>
          </div>

          <div style={{ marginTop: "28px", textAlign: "center" }}>
            <p className="text-muted" style={{ fontSize: "0.75rem", margin: 0 }}>
              For emergencies, call your local emergency number.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
