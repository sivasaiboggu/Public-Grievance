"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check } from "lucide-react";
import { toList, type Auth } from "@grievancegrid/api-client";
import { formatRelativeTime } from "../lib/labels";

interface NotificationItem {
  id: string;
  complaint_id: string | null;
  title: string;
  body?: string;
  message?: string;
  link?: string | null;
  read: boolean;
  created_at: string;
}

export function NotificationsBell({ auth }: { auth: Auth | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 1. Lightweight poll for unread count every 15s & window focus
  const fetchUnreadCount = useCallback(async () => {
    if (!auth) return;
    try {
      const res = await fetch("/api/v1/notifications/unread-count", {
        headers: { Authorization: `Bearer ${auth.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(typeof data.unread_count === "number" ? data.unread_count : 0);
      }
    } catch {
      // Background count poll is non-blocking
    }
  }, [auth]);

  // 2. Fetch full list when popover opens or count changes
  const fetchList = useCallback(async () => {
    if (!auth) return;
    setLoading(true);
    try {
      const res = await fetch("/api/v1/notifications", {
        headers: { Authorization: `Bearer ${auth.access_token}` },
      });
      if (res.ok) {
        const raw = await res.json();
        const list = toList<NotificationItem>(raw);
        setNotifications(list);
        setUnreadCount(list.filter((n) => !n.read).length);
      }
    } catch {
      // Non-blocking
    } finally {
      setLoading(false);
    }
  }, [auth]);

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 15000);
    const handleFocus = () => fetchUnreadCount();
    const handleRealtimeNotif = () => {
      fetchUnreadCount();
      if (open) fetchList();
    };
    window.addEventListener("focus", handleFocus);
    window.addEventListener("gg:notification:created", handleRealtimeNotif);
    window.addEventListener("gg:notification:refresh", handleRealtimeNotif);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("gg:notification:created", handleRealtimeNotif);
      window.removeEventListener("gg:notification:refresh", handleRealtimeNotif);
    };
  }, [fetchUnreadCount, open, fetchList]);

  useEffect(() => {
    if (open) {
      fetchList();
    }
  }, [open, fetchList]);

  // Click outside and Escape key handler
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const badgeText = unreadCount > 9 ? "9+" : unreadCount > 0 ? String(unreadCount) : "";

  const handleMarkAllRead = async () => {
    if (!auth) return;
    try {
      await fetch("/api/v1/notifications/read-all", {
        method: "POST",
        headers: { Authorization: `Bearer ${auth.access_token}` },
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // Non-blocking
    }
  };

  const handleClickItem = async (n: NotificationItem) => {
    if (!n.read && auth) {
      try {
        await fetch(`/api/v1/notifications/${n.id}/read`, {
          method: "POST",
          headers: { Authorization: `Bearer ${auth.access_token}` },
        });
      } catch {
        // Ignored
      }
      setNotifications((prev) =>
        prev.map((item) => (item.id === n.id ? { ...item, read: true } : item))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
    setOpen(false);

    // Route depending on role and target
    const role = auth?.user.role;
    const cid = n.complaint_id || (n.link && n.link.includes("reports/") ? n.link.split("reports/")[-1] : null);

    if (cid) {
      if (role === "gro") {
        router.push(`/officer?id=${encodeURIComponent(cid)}`);
      } else if (role === "field_officer") {
        router.push(`/field?id=${encodeURIComponent(cid)}`);
      } else if (role === "citizen") {
        router.push(`/citizen/reports/${encodeURIComponent(cid)}`);
      } else if (role === "supervisor") {
        router.push(`/senior/reports?id=${encodeURIComponent(cid)}`);
      }
    } else if (n.link) {
      router.push(n.link);
    }
  };

  if (!auth) return null;

  // Split items into Today vs Earlier
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  const todayItems: NotificationItem[] = [];
  const earlierItems: NotificationItem[] = [];

  for (const item of notifications) {
    const t = new Date(item.created_at).getTime();
    if (t >= startOfToday) {
      todayItems.push(item);
    } else {
      earlierItems.push(item);
    }
  }

  const renderItem = (n: NotificationItem) => {
    const textContent = n.body || n.message || n.title;

    return (
      <div
        key={n.id}
        role="button"
        tabIndex={0}
        onClick={() => handleClickItem(n)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClickItem(n);
          }
        }}
        style={{
          display: "flex",
          gap: "10px",
          padding: "12px 16px",
          borderBottom: "1px solid var(--border)",
          backgroundColor: n.read ? "#ffffff" : "var(--primary-tint, #f0f4ff)",
          cursor: "pointer",
          textAlign: "left",
          transition: "background-color 120ms ease",
          outline: "none",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "var(--bg-subtle, #f5f4f0)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = n.read
            ? "#ffffff"
            : "var(--primary-tint, #f0f4ff)";
        }}
      >
        {/* Unread indicator dot */}
        <div style={{ paddingTop: "5px", flexShrink: 0 }}>
          <div
            style={{
              width: "7px",
              height: "7px",
              borderRadius: "50%",
              backgroundColor: n.read ? "transparent" : "var(--primary, #1D4ED8)",
            }}
          />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: "0.8125rem",
              lineHeight: 1.4,
              color: "var(--text-ink)",
              fontWeight: n.read ? 400 : 500,
              overflowWrap: "anywhere",
            }}
          >
            {textContent}
          </div>
          <div
            style={{
              fontSize: "0.6875rem",
              color: "var(--text-muted)",
              marginTop: "4px",
            }}
          >
            {formatRelativeTime(n.created_at)}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        className="btn-ghost"
        style={{
          position: "relative",
          padding: "8px",
          minHeight: "36px",
          minWidth: "36px",
          borderRadius: "var(--radius-sm)",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          border: "none",
        }}
        aria-label={`Notifications, ${unreadCount} unread`}
        aria-expanded={open}
        title="Notifications"
      >
        <Bell size={18} />
        {badgeText && (
          <span
            style={{
              position: "absolute",
              top: "1px",
              right: "1px",
              minWidth: "15px",
              height: "15px",
              padding: "0 3px",
              backgroundColor: "var(--priority-high, #C2540A)",
              color: "#ffffff",
              borderRadius: "9999px",
              fontSize: "0.625rem",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,
              boxShadow: "0 0 0 2px var(--bg-surface, #ffffff)",
              pointerEvents: "none",
            }}
          >
            {badgeText}
          </span>
        )}
      </button>

      {open && (
        <div
          role="region"
          aria-label="Notifications"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 10px)",
            width: "380px",
            maxWidth: "calc(100vw - 32px)",
            maxHeight: "480px",
            backgroundColor: "#ffffff",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            boxShadow: "0 8px 24px rgba(21, 23, 28, 0.1)",
            zIndex: 100,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 16px",
              borderBottom: "1px solid var(--border)",
              position: "sticky",
              top: 0,
              backgroundColor: "#ffffff",
              zIndex: 1,
            }}
          >
            <span style={{ fontWeight: 600, fontSize: "0.875rem", color: "var(--text-ink)" }}>
              Notifications
            </span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "0.75rem",
                  color: "var(--primary)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "4px 6px",
                  borderRadius: "var(--radius-sm)",
                  fontWeight: 500,
                }}
              >
                <Check size={12} />
                <span>Mark all as read</span>
              </button>
            )}
          </div>

          {/* List Content */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {loading && notifications.length === 0 ? (
              <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: "0.8125rem" }}>
                Loading…
              </div>
            ) : notifications.length === 0 ? (
              <div
                style={{
                  padding: "36px 16px",
                  textAlign: "center",
                  color: "var(--text-muted)",
                  fontSize: "0.84rem",
                }}
              >
                Nothing new.
              </div>
            ) : (
              <>
                {todayItems.length > 0 && (
                  <div>
                    <div
                      style={{
                        padding: "8px 16px 4px 16px",
                        fontSize: "0.6875rem",
                        fontWeight: 600,
                        color: "var(--text-muted)",
                        backgroundColor: "var(--bg-subtle, #f6f5f2)",
                      }}
                    >
                      Today
                    </div>
                    {todayItems.map(renderItem)}
                  </div>
                )}

                {earlierItems.length > 0 && (
                  <div>
                    <div
                      style={{
                        padding: "8px 16px 4px 16px",
                        fontSize: "0.6875rem",
                        fontWeight: 600,
                        color: "var(--text-muted)",
                        backgroundColor: "var(--bg-subtle, #f6f5f2)",
                      }}
                    >
                      Earlier
                    </div>
                    {earlierItems.map(renderItem)}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
