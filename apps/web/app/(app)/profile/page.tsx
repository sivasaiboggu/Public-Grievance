"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, LogOut, Shield, Smartphone, User as UserIcon } from "lucide-react";
import { clearStoredAuth, getStoredAuth } from "../../../lib/auth";
import { PLAIN_ROLE_LABELS } from "../../../lib/labels";

interface SessionItem {
  id: string;
  device_info: string | null;
  created_at: string;
  expires_at: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const auth = getStoredAuth();

  const [name, setName] = useState(auth?.user.name || "");
  const [phone, setPhone] = useState(auth?.user.phone || "");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState<string | null>(null);

  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      router.push("/sign-in");
      return;
    }

    const fetchSessions = async () => {
      try {
        const res = await fetch("/api/v1/auth/sessions", {
          headers: { Authorization: `Bearer ${auth.access_token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setSessions(data);
        }
      } catch {
        // Ignored
      } finally {
        setSessionsLoading(false);
      }
    };

    fetchSessions();
  }, [auth, router]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth) return;
    setProfileSaving(true);
    setProfileMessage(null);

    try {
      const res = await fetch("/api/v1/auth/me", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.access_token}`,
        },
        body: JSON.stringify({ name, phone }),
      });

      if (res.ok) {
        const updated = await res.json();
        // Update stored auth
        const newAuth = { ...auth, user: updated };
        localStorage.setItem("grievancegrid_auth", JSON.stringify(newAuth));
        setProfileMessage("Your profile information has been updated.");
      } else {
        setProfileMessage("Could not update profile. Please try again.");
      }
    } catch {
      setProfileMessage("Could not update profile. Please try again.");
    } finally {
      setProfileSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    setPwSuccess(null);

    if (newPassword.length < 12) {
      setPwError("New password must be at least 12 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError("Passwords do not match.");
      return;
    }

    setPwSaving(true);
    try {
      const res = await fetch("/api/v1/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth?.access_token}`,
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });

      if (res.ok) {
        setPwSuccess("Your password was changed. Other sessions were signed out.");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        const err = await res.json();
        setPwError(err.detail || "Could not change password. Please check your current password.");
      }
    } catch {
      setPwError("Could not change password. Please try again.");
    } finally {
      setPwSaving(false);
    }
  };

  const handleRevokeAllSessions = async () => {
    if (!auth) return;
    try {
      await fetch("/api/v1/auth/sessions/revoke-all", {
        method: "POST",
        headers: { Authorization: `Bearer ${auth.access_token}` },
      });
      clearStoredAuth();
      router.push("/sign-in");
    } catch {
      // Ignored
    }
  };

  if (!auth) return null;

  return (
    <div className="shell page-content" style={{ maxWidth: "800px", margin: "0 auto", padding: "32px 16px" }}>
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, margin: "0 0 6px 0", letterSpacing: "-0.02em" }}>
          Profile and Account
        </h1>
        <p style={{ margin: 0, color: "var(--color-text-muted)", fontSize: "0.9375rem" }}>
          Manage your personal information, security preferences, and active devices.
        </p>
      </div>

      {/* Basic details */}
      <div className="card" style={{ padding: "24px", marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
          <UserIcon size={20} color="var(--color-primary)" />
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, margin: 0 }}>Personal Information</h2>
        </div>

        <form onSubmit={handleUpdateProfile} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label className="field-label" htmlFor="user-name">Full name</label>
            <input
              id="user-name"
              className="field-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="field-label" htmlFor="user-email">Email address</label>
            <input
              id="user-email"
              className="field-input"
              value={auth.user.email}
              disabled
              style={{ backgroundColor: "var(--color-background-subtle, #f8fafc)", color: "var(--color-text-muted)" }}
            />
            <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "4px", display: "block" }}>
              Your email is used to sign in and cannot be changed here.
            </span>
          </div>

          <div>
            <label className="field-label" htmlFor="user-phone">Phone number (optional)</label>
            <input
              id="user-phone"
              className="field-input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. +91 98450 00000"
            />
          </div>

          <div>
            <label className="field-label">Assigned role</label>
            <div style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--color-text)" }}>
              {PLAIN_ROLE_LABELS[auth.user.role] || auth.user.role}
            </div>
          </div>

          {profileMessage && (
            <div style={{ fontSize: "0.8125rem", color: "var(--color-primary)", fontWeight: 500 }}>
              {profileMessage}
            </div>
          )}

          <div>
            <button type="submit" disabled={profileSaving} className="btn-primary" style={{ minHeight: "40px" }}>
              {profileSaving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </form>
      </div>

      {/* Change Password */}
      <div className="card" style={{ padding: "24px", marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
          <Lock size={20} color="var(--color-primary)" />
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, margin: 0 }}>Change Password</h2>
        </div>

        <form onSubmit={handleChangePassword} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label className="field-label" htmlFor="current-pw">Current password</label>
            <input
              id="current-pw"
              type="password"
              className="field-input"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="field-label" htmlFor="new-pw">New password</label>
            <input
              id="new-pw"
              type="password"
              className="field-input"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={12}
            />
            <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "4px", display: "block" }}>
              Must be at least 12 characters.
            </span>
          </div>

          <div>
            <label className="field-label" htmlFor="confirm-pw">Confirm new password</label>
            <input
              id="confirm-pw"
              type="password"
              className="field-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          {pwError && (
            <div style={{ fontSize: "0.8125rem", color: "var(--color-danger, #ef4444)", fontWeight: 500 }}>
              {pwError}
            </div>
          )}
          {pwSuccess && (
            <div style={{ fontSize: "0.8125rem", color: "var(--color-success, #16a34a)", fontWeight: 500 }}>
              {pwSuccess}
            </div>
          )}

          <div>
            <button type="submit" disabled={pwSaving} className="btn-secondary" style={{ minHeight: "40px" }}>
              {pwSaving ? "Updating password..." : "Update password"}
            </button>
          </div>
        </form>
      </div>

      {/* Signed-in Devices / Sessions */}
      <div className="card" style={{ padding: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Smartphone size={20} color="var(--color-primary)" />
            <h2 style={{ fontSize: "1.125rem", fontWeight: 600, margin: 0 }}>Signed-in Devices</h2>
          </div>
          <button
            type="button"
            onClick={handleRevokeAllSessions}
            className="btn-ghost"
            style={{ color: "var(--color-danger, #ef4444)", fontSize: "0.8125rem", padding: "6px 12px" }}
          >
            Sign out everywhere
          </button>
        </div>

        <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", marginBottom: "16px" }}>
          These devices currently hold an active refresh session for your account.
        </p>

        {sessionsLoading ? (
          <div style={{ color: "var(--color-text-muted)", fontSize: "0.875rem" }}>Loading active devices...</div>
        ) : sessions.length === 0 ? (
          <div style={{ color: "var(--color-text-muted)", fontSize: "0.875rem" }}>Only your current active browser session is active.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {sessions.map((s) => (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 16px",
                  borderRadius: "8px",
                  backgroundColor: "var(--color-background-subtle, #f8fafc)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <div>
                  <div style={{ fontWeight: 500, fontSize: "0.875rem", color: "var(--color-text)" }}>
                    {s.device_info || "Web Browser"}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                    Signed in: {new Date(s.created_at).toLocaleDateString()} at {new Date(s.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
                <span style={{ fontSize: "0.75rem", color: "var(--color-success, #16a34a)", fontWeight: 500 }}>
                  Active
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
