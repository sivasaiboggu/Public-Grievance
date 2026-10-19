"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, LogOut, Shield, Smartphone, User as UserIcon } from "lucide-react";
import type { Auth } from "@grievancegrid/api-client";
import { Wordmark } from "./Wordmark";
import { NotificationsBell } from "./NotificationsBell";
import { clearStoredAuth, getRoleHomePath } from "../lib/auth";
import { PLAIN_ROLE_LABELS } from "../lib/labels";

interface HeaderProps {
  auth: Auth | null;
}

export function Header({ auth }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSignOut = () => {
    clearStoredAuth();
    router.push("/sign-in");
  };

  const role = auth?.user.role;
  const homePath = role ? getRoleHomePath(role) : "/";
  const roleDisplay = role ? (PLAIN_ROLE_LABELS[role] || role) : "";

  return (
    <header className="app-header">
      <div className="shell header-inner">
        <div style={{ display: "flex", alignItems: "center", gap: "28px" }}>
          <Wordmark href={homePath} size={20} />

          {/* Role navigation */}
          {role === "citizen" && (
            <nav aria-label="Citizen navigation" className="header-nav">
              <Link
                href="/citizen"
                className={`nav-link ${pathname === "/citizen" ? "active" : ""}`}
              >
                My reports
              </Link>
            </nav>
          )}

          {role === "gro" && (
            <nav aria-label="Officer navigation" className="header-nav">
              <Link
                href="/officer"
                className={`nav-link ${pathname.startsWith("/officer") ? "active" : ""}`}
              >
                Reports
              </Link>
            </nav>
          )}

          {role === "field_officer" && (
            <nav aria-label="Field worker navigation" className="header-nav">
              <Link
                href="/field"
                className={`nav-link ${pathname === "/field" ? "active" : ""}`}
              >
                Your work
              </Link>
            </nav>
          )}

          {role === "supervisor" && (
            <nav aria-label="Senior authority navigation" className="header-nav">
              <Link
                href="/senior"
                className={`nav-link ${pathname === "/senior" ? "active" : ""}`}
              >
                Overview
              </Link>
              <Link
                href="/senior/officers"
                className={`nav-link ${pathname.startsWith("/senior/officers") ? "active" : ""}`}
              >
                Officers
              </Link>
              <Link
                href="/senior/reports"
                className={`nav-link ${pathname.startsWith("/senior/reports") ? "active" : ""}`}
              >
                Reports
              </Link>
            </nav>
          )}

          {role === "admin" && (
            <nav aria-label="Admin navigation" className="header-nav">
              <Link
                href="/admin"
                className={`nav-link ${pathname === "/admin" ? "active" : ""}`}
              >
                Admin
              </Link>
            </nav>
          )}
        </div>

        {/* Right side: Notifications bell & Avatar Profile Menu */}
        {auth && (
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <NotificationsBell auth={auth} />

            <div ref={profileRef} style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setProfileOpen(!profileOpen)}
                className="btn-ghost"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "4px 8px 4px 6px",
                  minHeight: "36px",
                  borderRadius: "8px",
                  cursor: "pointer",
                }}
                aria-label="User account menu"
                aria-expanded={profileOpen}
              >
                <div
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "50%",
                    backgroundColor: "var(--color-primary, #2563eb)",
                    color: "#ffffff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 600,
                    fontSize: "0.8125rem",
                  }}
                >
                  {auth.user.name.charAt(0).toUpperCase()}
                </div>
                <div style={{ textAlign: "left", display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
                  <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-text)" }}>
                    {auth.user.name}
                  </span>
                  <span style={{ fontSize: "0.6875rem", color: "var(--color-text-muted)" }}>
                    {roleDisplay}
                  </span>
                </div>
                <ChevronDown size={14} color="var(--color-text-muted)" />
              </button>

              {profileOpen && (
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "calc(100% + 6px)",
                    width: "220px",
                    backgroundColor: "#ffffff",
                    border: "1px solid var(--color-border)",
                    borderRadius: "10px",
                    boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)",
                    zIndex: 100,
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--color-border)", backgroundColor: "var(--color-background-subtle, #f8fafc)" }}>
                    <div style={{ fontWeight: 600, fontSize: "0.8125rem", color: "var(--color-text)" }}>
                      {auth.user.name}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {auth.user.email}
                    </div>
                  </div>

                  <Link
                    href="/profile"
                    onClick={() => setProfileOpen(false)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "10px 14px",
                      fontSize: "0.8125rem",
                      fontWeight: 500,
                      color: "var(--color-text)",
                      textDecoration: "none",
                      boxSizing: "border-box",
                      width: "100%",
                      textAlign: "left",
                    }}
                  >
                    <UserIcon size={16} color="var(--color-text-muted)" style={{ flexShrink: 0 }} />
                    <span>Profile and account</span>
                  </Link>

                  <div style={{ height: "1px", backgroundColor: "var(--color-border)", margin: "2px 0" }} />

                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      handleSignOut();
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "10px 14px",
                      fontSize: "0.8125rem",
                      fontWeight: 500,
                      color: "var(--color-danger, #ef4444)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      width: "100%",
                      textAlign: "left",
                      boxSizing: "border-box",
                      fontFamily: "inherit",
                    }}
                  >
                    <LogOut size={16} style={{ flexShrink: 0 }} />
                    <span>Sign out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
