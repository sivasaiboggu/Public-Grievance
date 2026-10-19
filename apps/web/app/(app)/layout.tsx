"use client";

import React, { useEffect, useState, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import { Header } from "../../components/Header";
import { SeniorDeadlineModal, type SeniorAlertData } from "../../components/SeniorDeadlineModal";
import { getStoredAuth, getRoleHomePath } from "../../lib/auth";
import type { Auth } from "@grievancegrid/api-client";

// Role-to-route prefix mapping for strict enforcement
const ROLE_PREFIXES: Record<string, string[]> = {
  citizen: ["/citizen"],
  gro: ["/officer"],
  field_officer: ["/field"],
  supervisor: ["/senior"],
  admin: ["/admin"],
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [auth, setAuth] = useState<Auth | null>(null);
  const [checked, setChecked] = useState(false);
  const [seniorAlert, setSeniorAlert] = useState<SeniorAlertData | null>(null);
  const abortCtrlRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const current = getStoredAuth();
    if (!current?.access_token || !current?.user?.role) {
      toast.error("Please sign in to continue.");
      router.replace("/sign-in");
      return;
    }

    const userRole = current.user.role;
    const allowedPrefixes = ROLE_PREFIXES[userRole] || [];

    // Verify if active path is permitted for this role
    const isAllowed = allowedPrefixes.some((prefix) => pathname.startsWith(prefix));

    if (!isAllowed) {
      // Wrong role! Redirect to role's designated home
      const designatedHome = getRoleHomePath(userRole);
      router.replace(designatedHome);
      return;
    }

    setAuth(current);
    setChecked(true);
  }, [pathname, router]);

  // Real-time Server-Sent Events (SSE) Stream
  useEffect(() => {
    if (!auth?.access_token) return;

    const ctrl = new AbortController();
    abortCtrlRef.current = ctrl;

    const connectSSE = async () => {
      try {
        await fetchEventSource("/api/v1/events/stream", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${auth.access_token}`,
          },
          signal: ctrl.signal,
          onmessage(msg) {
            if (msg.event === "notification.created") {
              window.dispatchEvent(new CustomEvent("gg:notification:created", { detail: msg.data }));
              // Optional desktop notification when tab is hidden
              if (document.hidden && typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
                try {
                  const data = JSON.parse(msg.data);
                  new Notification(data.title || "GrievanceGrid update", {
                    body: data.body || "New event received",
                    icon: "/favicon.ico",
                  });
                } catch {}
              }
            } else if (msg.event === "report.updated") {
              window.dispatchEvent(new CustomEvent("gg:report:updated", { detail: msg.data }));
            } else if (msg.event === "escalation.raised") {
              try {
                const payload = JSON.parse(msg.data);
                if (auth.user?.role === "supervisor" || (auth.user?.role as string) === "senior") {
                  setSeniorAlert(payload);
                }
              } catch {}
            }
          },
          onerror(err) {
            // fetchEventSource will retry automatically with Last-Event-ID
          },
        });
      } catch (e) {
        // Fallback polling already exists in bell component
      }
    };

    connectSSE();

    return () => {
      ctrl.abort();
    };
  }, [auth]);

  // Scroll to top on route change
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);

  // Guard against lingering scroll locks or pointer-events from dialogs/popovers
  useEffect(() => {
    const cleanupScrollLock = () => {
      const activeModal = document.querySelector("[role='dialog'], [role='alertdialog'], [data-state='open']");
      if (!activeModal) {
        if (document.body.style.overflow === "hidden") {
          document.body.style.overflow = "";
        }
        if (document.body.style.pointerEvents === "none") {
          document.body.style.pointerEvents = "";
        }
        if (document.body.hasAttribute("data-scroll-locked")) {
          document.body.removeAttribute("data-scroll-locked");
        }
      }
    };
    const observer = new MutationObserver(cleanupScrollLock);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["style", "data-scroll-locked", "class"],
    });
    return () => observer.disconnect();
  }, []);

  if (!checked || !auth) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="skeleton" style={{ width: "120px", height: "20px" }} />
      </div>
    );
  }

  const isCitizenRoute = pathname.startsWith("/citizen");
  const isFullHeightWorkspace = pathname.startsWith("/officer") || pathname.startsWith("/field");

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Header auth={auth} />
      <main
        id="main-content"
        className="app-main"
        style={{
          flex: 1,
          minHeight: 0,
          width: "100%",
          paddingTop: isFullHeightWorkspace ? "0px" : "24px",
          paddingBottom: isFullHeightWorkspace ? "0px" : "64px",
        }}
      >
        {children}
        {isCitizenRoute && (
          <footer className="shell" style={{ marginTop: "48px", paddingTop: "24px", borderTop: "1px solid var(--border)", textAlign: "center" }}>
            <p className="text-muted" style={{ fontSize: "0.8125rem" }}>
              For emergencies, call your local emergency number.
            </p>
          </footer>
        )}
      </main>

      {/* Real-time Senior Deadline Pop-up */}
      {seniorAlert && (
        <SeniorDeadlineModal
          alert={seniorAlert}
          authToken={auth.access_token}
          onDismiss={() => setSeniorAlert(null)}
        />
      )}
    </div>
  );
}
