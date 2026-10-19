"use client";

import React, { useState } from "react";
import { CameraIcon, CheckCircleIcon, ClockIcon, MapPinIcon, ShieldIcon, WrenchIcon } from "./Icons";

interface WorkOrder {
  id: string;
  tracking_id: string;
  category: string;
  landmark: string;
  coordinates: string;
  instructions: string;
  priority: "critical" | "high" | "medium";
  status: "assigned" | "in_progress" | "submitted_for_review";
}

const INITIAL_ORDERS: WorkOrder[] = [
  {
    id: "WO-2026-081",
    tracking_id: "GG-2026-44B9",
    category: "Potholes / visible road damage",
    landmark: "4th Main Road, opp. Central High School",
    coordinates: "12.9716, 77.5946",
    instructions: "Patch 10cm pothole with cold-mix asphalt. Ensure level transition for cyclists.",
    priority: "high",
    status: "assigned",
  },
  {
    id: "WO-2026-092",
    tracking_id: "GG-2026-11C2",
    category: "Missing / broken manhole cover",
    landmark: "Corner of Market Street and 2nd Cross",
    coordinates: "12.9812, 77.6041",
    instructions: "Install reinforced concrete replacement cover and cordon perimeter.",
    priority: "critical",
    status: "in_progress",
  },
];

export function FieldWorkerView() {
  const [orders, setOrders] = useState<WorkOrder[]>(INITIAL_ORDERS);
  const [selectedOrder, setSelectedOrder] = useState<WorkOrder | null>(INITIAL_ORDERS[0]);
  const [completionNote, setCompletionNote] = useState("");
  const [simulatedPhoto, setSimulatedPhoto] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"synced" | "pending">("synced");
  const [notice, setNotice] = useState("");

  const handleComplete = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;

    setOrders((prev) =>
      prev.map((o) => (o.id === selectedOrder.id ? { ...o, status: "submitted_for_review" } : o))
    );
    setSelectedOrder({ ...selectedOrder, status: "submitted_for_review" });
    setNotice(`Work order ${selectedOrder.id} submitted for municipal verification.`);
    setCompletionNote("");
    setSimulatedPhoto(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div>
        <h2 style={{ fontSize: "1.35rem", fontWeight: 700, margin: "0 0 4px" }}>Municipal Field Operations Terminal</h2>
        <p className="text-muted" style={{ fontSize: "0.875rem", margin: 0 }}>
          Offline-resilient assignment tracking. Completing field work submits an inspection report for officer review. It does not automatically close the report.
        </p>
      </div>

      {notice && (
        <div role="status" className="banner banner-notice">
          <CheckCircleIcon size={20} style={{ color: "var(--success)", flexShrink: 0 }} />
          <span>{notice}</span>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "24px", alignItems: "start" }}>
        
        {/* Left: Assigned Work Orders */}
        <section className="panel" aria-labelledby="work-list-heading">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <div>
              <h3 id="work-list-heading">Assigned Work Orders</h3>
              <p className="text-muted" style={{ fontSize: "0.8rem" }}>
                {orders.length} assigned task{orders.length === 1 ? "" : "s"} · Offline synced
              </p>
            </div>
            <span className="badge badge-resolved" style={{ fontSize: "0.75rem" }}>
              {syncStatus === "synced" ? "Synced" : "Waiting to sync"}
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {orders.map((wo) => (
              <div
                key={wo.id}
                onClick={() => setSelectedOrder(wo)}
                style={{
                  padding: "14px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border)",
                  backgroundColor: selectedOrder?.id === wo.id ? "var(--primary-tint)" : "var(--bg-surface)",
                  cursor: "pointer",
                  transition: "all 140ms ease",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                  <div>
                    <span className="tabular text-muted" style={{ fontSize: "0.75rem", fontWeight: 600 }}>
                      {wo.id} · Ref: {wo.tracking_id}
                    </span>
                    <h4 style={{ fontSize: "0.95rem", marginTop: "2px" }}>{wo.category}</h4>
                  </div>
                  <span className={`badge badge-${wo.priority === "critical" ? "rejected" : "under_review"}`} style={{ fontSize: "0.7rem" }}>
                    {wo.priority}
                  </span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "6px", fontSize: "0.825rem" }} className="text-muted">
                  <MapPinIcon size={14} />
                  <span>{wo.landmark}</span>
                </div>

                <div style={{ marginTop: "8px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.775rem" }}>
                  <span className="badge badge-submitted" style={{ textTransform: "capitalize" }}>
                    {wo.status.replaceAll("_", " ")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Right: Work Order Action & Completion Evidence */}
        <section className="panel" aria-labelledby="order-detail-heading">
          {selectedOrder ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <span className="tabular text-muted" style={{ fontSize: "0.8rem" }}>
                  Work Order: {selectedOrder.id}
                </span>
                <h3 id="order-detail-heading" style={{ fontSize: "1.25rem", marginTop: "2px" }}>
                  {selectedOrder.category}
                </h3>
                <span className="tabular" style={{ fontSize: "0.85rem", color: "var(--primary-text)", fontWeight: 600 }}>
                  Citizen Complaint: {selectedOrder.tracking_id}
                </span>
              </div>

              <div style={{ padding: "12px", background: "var(--bg-subtle)", borderRadius: "var(--radius-md)" }}>
                <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-muted)" }}>
                  Field Directive
                </span>
                <p style={{ fontSize: "0.9rem", marginTop: "4px" }}>{selectedOrder.instructions}</p>
              </div>

              <dl style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: "6px", fontSize: "0.85rem" }}>
                <dt className="text-muted">Location:</dt>
                <dd>{selectedOrder.landmark}</dd>
                <dt className="text-muted">Coordinates:</dt>
                <dd className="tabular">{selectedOrder.coordinates}</dd>
              </dl>

              <div style={{ display: "flex", gap: "10px" }}>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedOrder.coordinates)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary"
                  style={{ flex: 1, textDecoration: "none", fontSize: "0.85rem" }}
                >
                  <MapPinIcon size={16} />
                  Open in Maps
                </a>
              </div>

              {selectedOrder.status !== "submitted_for_review" ? (
                <form onSubmit={handleComplete} style={{ display: "flex", flexDirection: "column", gap: "14px", borderTop: "1px solid var(--border)", paddingTop: "16px" }}>
                  <h4>Record Field Work Completion</h4>

                  <label>
                    <span>Capture completion photograph</span>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setSimulatedPhoto(true)}
                      style={{ width: "100%" }}
                    >
                      <CameraIcon size={18} />
                      {simulatedPhoto ? "Photo captured (1.4 MiB, EXIF stripped)" : "Snap / Upload repair evidence"}
                    </button>
                  </label>

                  <label>
                    <span>Completion notes & measurements</span>
                    <textarea
                      required
                      minLength={10}
                      rows={3}
                      placeholder="Detail asphalt volume used, compaction done, or safety barrier installed..."
                      value={completionNote}
                      onChange={(e) => setCompletionNote(e.target.value)}
                    />
                  </label>

                  <button type="submit" className="btn-primary" disabled={!completionNote.trim()}>
                    Submit for GRO Review
                  </button>
                </form>
              ) : (
                <div className="banner banner-notice" style={{ marginTop: "12px" }}>
                  <CheckCircleIcon size={20} style={{ flexShrink: 0 }} />
                  <div>
                    <strong>Work completed & submitted:</strong> Awaiting municipal officer review. The citizen complaint remains open until an authorized GRO inspects this record.
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-muted">Select a work order to view directives.</p>
          )}
        </section>

      </div>
    </div>
  );
}
