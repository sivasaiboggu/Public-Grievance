"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, AlertCircle } from "lucide-react";
import { ApiError } from "@grievancegrid/api-client";
import { Wordmark } from "../../../components/Wordmark";
import { AuthPhotoPane } from "../../../components/AuthPhotoPane";
import { getApiClient } from "../../../lib/api";
import { saveStoredAuth } from "../../../lib/auth";

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; email?: string; password?: string }>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    const errors: { name?: string; email?: string; password?: string } = {};
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName || trimmedName.length < 2) {
      errors.name = "Please enter your full name (at least 2 characters).";
    }

    if (!trimmedEmail) {
      errors.email = "Please enter your email address.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errors.email = "Please enter a valid email address.";
    }

    if (!password) {
      errors.password = "Please enter a password.";
    } else if (password.length < 12) {
      errors.password = "Password must be at least 12 characters.";
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
      await client.register(trimmedName, trimmedEmail, password);
      const res = await client.login(trimmedEmail, password);
      saveStoredAuth(res);
      router.push("/citizen");
    } catch (err: unknown) {
      let msg = "Could not create account. Please check your details and try again.";
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

  useEffect(() => {
    document.title = "Public GrievanceGrid";
  }, []);

  return (
    <div className="auth-split-wrapper">
      {/* Left Column: Full-height Edge-to-Edge Street Photo Panel */}
      <AuthPhotoPane />

      {/* Right Column: Centered Form */}
      <div className="auth-form-pane">
        <div className="auth-form-card">
          <div className="mobile-only-wordmark" style={{ marginBottom: "20px" }}>
            <Wordmark size={22} />
          </div>

          <div style={{ marginBottom: "24px" }}>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 600, margin: "0 0 6px" }}>Create an account</h2>
            <p className="text-muted" style={{ margin: 0, fontSize: "0.875rem" }}>
              Sign up as a resident to submit and track local reports
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
              <label htmlFor="name">Full name</label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                placeholder="e.g. Maya Sharma"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: undefined }));
                }}
                disabled={busy}
                style={{ borderColor: fieldErrors.name ? "var(--error)" : undefined }}
              />
              {fieldErrors.name && <span className="field-error">{fieldErrors.name}</span>}
            </div>

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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <label htmlFor="password">Password</label>
                <span className="text-muted" style={{ fontSize: "0.75rem" }}>At least 12 characters</span>
              </div>
              <div style={{ position: "relative" }}>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Choose a secure password"
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
              {fieldErrors.password && <span className="field-error">{fieldErrors.password}</span>}
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy}
              style={{ width: "100%", marginTop: "6px" }}
            >
              {busy ? "Creating account…" : "Create account"}
            </button>
          </form>

          <div style={{ marginTop: "24px", paddingTop: "20px", borderTop: "1px solid var(--border)", textAlign: "center" }}>
            <Link
              href="/sign-in"
              style={{ fontSize: "0.875rem", color: "var(--primary)", textDecoration: "none", fontWeight: 500 }}
            >
              Already registered? Sign in
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
