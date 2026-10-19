"use client";

import React, { useEffect, useRef, useState } from "react";
import { formatCategoryName } from "../lib/labels";
import { getStoredAuth } from "../lib/auth";

interface SeniorClusterItem {
  id: string;
  category: string;
  center_latitude: number;
  center_longitude: number;
  center_address: string;
  state: string;
  is_estimated: boolean;
  report_count: number;
  open_report_count: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  road_damage: "#2563eb",
  garbage: "#059669",
  waterlogging: "#0284c7",
  manhole: "#dc2626",
};

export function SeniorClusterMap() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [clusters, setClusters] = useState<SeniorClusterItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getStoredAuth();
    async function loadClusters() {
      try {
        const res = await fetch("/api/v1/senior/clusters", {
          headers: { Authorization: `Bearer ${auth?.access_token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setClusters(data);
        }
      } catch {
        // Ignored
      } finally {
        setLoading(false);
      }
    }
    loadClusters();
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function initMap() {
      if (!mapContainerRef.current || mapInstanceRef.current) return;
      const L = await import("leaflet");
      if (!isMounted || !mapContainerRef.current) return;

      const center: [number, number] = clusters.length > 0 && clusters[0].center_latitude
        ? [clusters[0].center_latitude, clusters[0].center_longitude]
        : [9.9312, 76.2673]; // Kochi default

      const map = L.map(mapContainerRef.current, {
        center,
        zoom: 12,
        zoomControl: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
        maxZoom: 18,
      }).addTo(map);

      mapInstanceRef.current = map;

      // Add circles for each cluster
      clusters.forEach((cl) => {
        if (!cl.center_latitude || !cl.center_longitude) return;

        const baseColor = CATEGORY_COLORS[cl.category] || "#4f46e5";
        const radius = Math.max(12, Math.min(36, 10 + cl.report_count * 3));

        const circle = L.circleMarker([cl.center_latitude, cl.center_longitude], {
          radius,
          color: baseColor,
          weight: cl.state === "confirmed" ? 2 : 1,
          dashArray: cl.state === "confirmed" ? undefined : "4, 4",
          fillColor: baseColor,
          fillOpacity: cl.state === "confirmed" ? 0.35 : 0.2,
        }).addTo(map);

        const statusLabel = cl.state === "confirmed" ? "Confirmed problem" : "Suggested cluster (Exploratory)";
        const popupContent = `
          <div style="font-family: inherit; font-size: 12px; line-height: 1.4; min-width: 160px;">
            <div style="font-weight: 600; font-size: 13px; margin-bottom: 4px;">${cl.center_address || "Ward Area"}</div>
            <div style="color: #64748b; margin-bottom: 2px;">Category: <b>${formatCategoryName(cl.category)}</b></div>
            <div style="margin-bottom: 4px;"><b>${cl.report_count}</b> reports (${cl.open_report_count} open)</div>
            <div style="font-size: 11px; color: ${cl.state === "confirmed" ? "#059669" : "#d97706"}; font-weight: 500;">
              ${statusLabel}
            </div>
          </div>
        `;
        circle.bindPopup(popupContent);
      });

      // Fit bounds if we have clusters
      if (clusters.length > 1) {
        const validCoords = clusters
          .filter((c) => c.center_latitude && c.center_longitude)
          .map((c) => [c.center_latitude, c.center_longitude] as [number, number]);
        if (validCoords.length > 0) {
          map.fitBounds(L.latLngBounds(validCoords), { padding: [30, 30] });
        }
      }
    }

    if (!loading) {
      initMap();
    }

    return () => {
      isMounted = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [clusters, loading]);

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        backgroundColor: "var(--bg-surface)",
        padding: "18px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
          <h3 style={{ fontSize: "0.95rem", fontWeight: 600, margin: 0, color: "var(--text-ink)" }}>
            Incident Clusters & Density
          </h3>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            {clusters.length} active incident areas
          </span>
        </div>
        <div style={{ display: "flex", gap: "12px", fontSize: "11px", color: "var(--text-muted)" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", border: "2px solid #2563eb", display: "inline-block" }} />
            Solid: Confirmed
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", border: "1px dashed #d97706", display: "inline-block" }} />
            Dashed: Suggested
          </span>
        </div>
      </div>

      <div
        ref={mapContainerRef}
        style={{
          width: "100%",
          height: "320px",
          borderRadius: "var(--radius-sm)",
          overflow: "hidden",
          border: "1px solid var(--border-subtle)",
          backgroundColor: "var(--bg-subtle)",
        }}
      />

      <div style={{ fontSize: "11px", color: "var(--text-muted)", lineHeight: 1.4 }}>
        Exploratory density map. Bubble size indicates report volume. Suggested clusters represent algorithmically grouped nearby reports within category radius.
      </div>
    </div>
  );
}
