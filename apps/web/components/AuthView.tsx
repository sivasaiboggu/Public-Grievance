"use client";

import React, { useState } from "react";
import { CheckCircleIcon, EyeIcon, EyeOffIcon, GridMarkIcon } from "./Icons";

interface AuthViewProps {
  onSignIn: (email: string, pass: string) => Promise<void>;
  onRegister: (name: string, email: string, pass: string) => Promise<void>;
  busy: boolean;
  error: string;
}

const DEMO_ACCOUNTS = [
  { label: "Citizen (Aarav Sharma)", email: "citizen@grievancegrid.test", pass: "Citizen@12345" },
  { label: "Officer (Priya Patel, GRO)", email: "officer@grievancegrid.test", pass: "Officer@12345" },
  { label: "Field Worker (Rajesh Kumar)", email: "field@grievancegrid.test", pass: "Field@12345" },
  { label: "Senior Authority (S. Ramanathan)", email: "senior@grievancegrid.test", pass: "Senior@12345" },
  { label: "System Administrator", email: "admin@grievancegrid.test", pass: "Admin@12345" },
];

export function AuthView({ onSignIn, onRegister, busy, error }: AuthViewProps) {
  const [isRegister, setIsRegister] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isRegister) {
      await onRegister(name, email, password);
    } else {
      await onSignIn(email, password);
    }
  };

  const handleSelectDemo = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (!val) return;
    const found = DEMO_ACCOUNTS.find((a) => a.email === val);
    if (found) {
      setEmail(found.email);
      setPassword(found.pass);
    }
  };

  const humanizedError = error
    ? error.toLowerCase().includes("cannot reach") || error.toLowerCase().includes("failed to fetch")
      ? "We can't reach the server. Check your connection and try again."
      : error
    : "";

  return (
    <div className="auth-container">
      {/* Left Column: Solid Civic Blue Hero Panel */}
      <div className="auth-hero-pane">
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", marginBottom: "32px", opacity: 0.95 }}>
            <GridMarkIcon size={22} style={{ color: "#ffffff" }} />
            <span style={{ fontSize: "1.1rem", fontWeight: 700, letterSpacing: "-0.01em" }}>
              GrievanceGrid
            </span>
          </div>

          <h2 className="auth-hero-title">Report it. Track it. See it fixed.</h2>
          <p className="auth-hero-desc">
            A direct channel between residents and municipal teams for roads, sanitation, and street infrastructure.
          </p>

          <ul className="auth-feature-list">
            <li className="auth-feature-item">
              <span className="auth-feature-bullet">
                <CheckCircleIcon size={14} style={{ color: "#ffffff" }} />
              </span>
              <span>Tamper-evident status audit log for every filed report</span>
            </li>
            <li className="auth-feature-item">
              <span className="auth-feature-bullet">
                <CheckCircleIcon size={14} style={{ color: "#ffffff" }} />
              </span>
              <span>Verified resolutions certified by municipal officers</span>
            </li>
            <li className="auth-feature-item">
              <span className="auth-feature-bullet">
                <CheckCircleIcon size={14} style={{ color: "#ffffff" }} />
              </span>
              <span>Mobile-first tracking across all modern devices</span>
            </li>
          </ul>
        </div>

        <div style={{ fontSize: "0.8rem", color: "rgba(255, 255, 255, 0.7)", marginTop: "40px" }}>
          Civic Infrastructure & Maintenance
        </div>
      </div>

      {/* Right Column: Centered Form Panel */}
      <div className="auth-form-pane">
        <div className="auth-form-header">
          <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
            <GridMarkIcon size={24} style={{ color: "var(--civic-600, #1d4ed8)" }} />
            <span style={{ fontSize: "1.3rem", letterSpacing: "-0.02em" }}>
              <strong style={{ fontWeight: 700 }}>Grievance</strong>
              <span style={{ fontWeight: 400 }}>Grid</span>
            </span>
          </div>

          <h1 style={{ fontSize: "1.45rem", fontWeight: 700, margin: "0 0 6px" }}>
            {isRegister ? "Create a citizen account" : "Sign in to GrievanceGrid"}
          </h1>
          <p className="text-muted" style={{ fontSize: "0.875rem", margin: 0 }}>
            {isRegister
              ? "Register to submit and track civic complaints"
              : "Access your active reports and official responses"}
          </p>
        </div>

        {/* Quiet Dev Test Account Selector */}
        {!isRegister && (
          <div className="auth-quick-select">
            <label style={{ display: "block", marginBottom: "6px", fontSize: "0.78rem", fontWeight: 600, color: "var(--text-muted)" }}>
              Fast Sign-In (Test Accounts):
            </label>
            <select
              aria-label="Select test account"
              onChange={handleSelectDemo}
              defaultValue=""
              style={{
                width: "100%",
                padding: "6px 10px",
                fontSize: "0.825rem",
                borderRadius: "var(--radius-sm)",
                borderColor: "var(--border)",
              }}
            >
              <option value="" disabled>
                Select an account to autofill…
              </option>
              {DEMO_ACCOUNTS.map((acc) => (
                <option key={acc.email} value={acc.email}>
                  {acc.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Inline Error Banner */}
        {humanizedError && (
          <div role="alert" className="banner banner-error" style={{ marginBottom: "18px" }}>
            <span>{humanizedError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {isRegister && (
            <label>
              Full name
              <input
                name="name"
                type="text"
                required
                minLength={2}
                maxLength={120}
                autoComplete="name"
                placeholder="e.g. Maya Sharma"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={busy}
              />
            </label>
          )}

          <label>
            Email address
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
          </label>

          <label>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Password</span>
              {isRegister && (
                <span className="text-muted" style={{ fontSize: "0.8rem", fontWeight: 400 }}>
                  Min 12 characters
                </span>
              )}
            </div>
            <div style={{ position: "relative" }}>
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                required
                minLength={isRegister ? 12 : 1}
                maxLength={128}
                autoComplete={isRegister ? "new-password" : "current-password"}
                placeholder={isRegister ? "Choose a strong password (12+ characters)" : "Enter your password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
                style={{ paddingRight: "44px" }}
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
                  minHeight: "36px",
                  height: "36px",
                  width: "36px",
                  padding: 0,
                }}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
              </button>
            </div>
          </label>

          <button
            type="submit"
            className="btn-primary"
            disabled={busy}
            style={{ width: "100%", marginTop: "8px", minHeight: "44px" }}
          >
            {busy ? "Signing in…" : isRegister ? "Create account and sign in" : "Sign in"}
          </button>
        </form>

        <div style={{ borderTop: "1px solid var(--border)", marginTop: "24px", paddingTop: "16px", textAlign: "center" }}>
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={() => {
              setIsRegister(!isRegister);
            }}
            style={{ width: "100%", minHeight: "40px" }}
          >
            {isRegister ? "Already registered? Sign in instead" : "New citizen? Create account"}
          </button>
        </div>
      </div>
    </div>
  );
}
