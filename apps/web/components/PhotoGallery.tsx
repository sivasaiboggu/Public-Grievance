"use client";

import React, { useEffect, useState, useCallback } from "react";
import { getApiClient } from "../lib/api";
import { ChevronLeft, ChevronRight, X, AlertCircle, RefreshCw, ZoomIn, ZoomOut, Sliders } from "lucide-react";
import { ReactCompareSlider, ReactCompareSliderImage } from "react-compare-slider";

export interface EvidenceItem {
  id: string;
  media_type: string;
  size_bytes: number;
  uploaded_at: string;
  phase?: "report" | "before" | "after";
  taken_at?: string;
  signed_url?: string;
}

interface PhotoGalleryProps {
  trackingId: string;
  evidence: EvidenceItem[];
  hideTitle?: boolean;
}

interface LoadedPhoto {
  id: string;
  url: string;
  status: "loading" | "loaded" | "error";
  retries: number;
}

function formatPhotoDate(isoString?: string): string {
  if (!isoString) return "";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(d);
  } catch {
    return "";
  }
}

export function PhotoGallery({ trackingId, evidence, hideTitle }: PhotoGalleryProps) {
  const [photos, setPhotos] = useState<Record<string, LoadedPhoto>>({});
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  const loadSignedUrl = useCallback(async (ev: EvidenceItem) => {
    // If the item already came with a fresh signed_url from the API, use it directly
    if (ev.signed_url) {
      setPhotos((prev) => ({
        ...prev,
        [ev.id]: {
          id: ev.id,
          url: ev.signed_url!,
          status: "loaded",
          retries: 0,
        },
      }));
      return;
    }

    setPhotos((prev) => ({
      ...prev,
      [ev.id]: {
        id: ev.id,
        url: "",
        status: "loading",
        retries: (prev[ev.id]?.retries || 0),
      },
    }));

    try {
      const client = getApiClient();
      const res = await client.signedEvidenceUrl(trackingId, ev.id);
      setPhotos((prev) => ({
        ...prev,
        [ev.id]: {
          id: ev.id,
          url: res.signed_url,
          status: "loaded",
          retries: (prev[ev.id]?.retries || 0),
        },
      }));
    } catch {
      setPhotos((prev) => ({
        ...prev,
        [ev.id]: {
          id: ev.id,
          url: "",
          status: "error",
          retries: (prev[ev.id]?.retries || 0) + 1,
        },
      }));
    }
  }, [trackingId]);

  useEffect(() => {
    evidence.forEach((ev) => {
      loadSignedUrl(ev);
    });
  }, [evidence, loadSignedUrl]);

  // Keyboard navigation for modal
  useEffect(() => {
    if (selectedIndex === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedIndex(null);
        setZoomLevel(1);
      } else if (e.key === "ArrowLeft") {
        setSelectedIndex((idx) => (idx !== null && idx > 0 ? idx - 1 : idx));
        setZoomLevel(1);
      } else if (e.key === "ArrowRight") {
        setSelectedIndex((idx) => (idx !== null && idx < evidence.length - 1 ? idx + 1 : idx));
        setZoomLevel(1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedIndex, evidence.length]);

  if (!evidence || evidence.length === 0) {
    return null;
  }

  const beforeEvidence = evidence.find((e) => e.phase === "before");
  const afterEvidence = evidence.find((e) => e.phase === "after");
  const beforePhoto = beforeEvidence ? photos[beforeEvidence.id] : null;
  const afterPhoto = afterEvidence ? photos[afterEvidence.id] : null;
  const hasBeforeAfterPair = beforePhoto?.status === "loaded" && afterPhoto?.status === "loaded";

  const selectedEvidence = selectedIndex !== null ? evidence[selectedIndex] : null;
  const selectedPhoto = selectedEvidence ? photos[selectedEvidence.id] : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Before and After slider when both exist */}
      {hasBeforeAfterPair && beforePhoto && afterPhoto && (
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            overflow: "hidden",
            backgroundColor: "var(--bg-surface)",
          }}
        >
          <div
            style={{
              padding: "10px 14px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: "var(--bg-subtle)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Sliders size={15} color="var(--primary)" />
              <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-ink)" }}>
                Before and after
              </span>
            </div>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Drag the divider to compare
            </span>
          </div>

          <div style={{ position: "relative", width: "100%", maxHeight: "360px", overflow: "hidden" }}>
            <ReactCompareSlider
              itemOne={
                <ReactCompareSliderImage
                  src={beforePhoto.url}
                  alt="Before repair work"
                  style={{ objectFit: "cover", width: "100%", height: "320px" }}
                />
              }
              itemTwo={
                <ReactCompareSliderImage
                  src={afterPhoto.url}
                  alt="After repair completed"
                  style={{ objectFit: "cover", width: "100%", height: "320px" }}
                />
              }
            />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              padding: "8px 14px",
              fontSize: "0.78rem",
              color: "var(--text-muted)",
              borderTop: "1px solid var(--border)",
              backgroundColor: "var(--bg-subtle)",
            }}
          >
            <div>
              <strong style={{ color: "var(--text-ink)" }}>Before</strong>
              {beforeEvidence?.taken_at && (
                <span> · {formatPhotoDate(beforeEvidence.taken_at)}</span>
              )}
            </div>
            <div style={{ textAlign: "right" }}>
              <strong style={{ color: "var(--text-ink)" }}>After</strong>
              {afterEvidence?.taken_at && (
                <span> · {formatPhotoDate(afterEvidence.taken_at)}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Grid of photos */}
      <div>
        {!hideTitle && (
          <h3
            style={{
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "var(--text-ink)",
              marginBottom: "8px",
            }}
          >
            Photos ({evidence.length})
          </h3>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
            gap: "10px",
          }}
        >
          {evidence.map((ev, idx) => {
            const item = photos[ev.id];
            const isLoading = !item || item.status === "loading";
            const isError = item?.status === "error";

            const phaseLabel =
              ev.phase === "before"
                ? "Before"
                : ev.phase === "after"
                ? "After"
                : "Report";

            return (
              <div
                key={ev.id}
                style={{
                  position: "relative",
                  aspectRatio: "1",
                  borderRadius: "var(--radius-sm)",
                  overflow: "hidden",
                  border: "1px solid var(--border)",
                  backgroundColor: "var(--bg-subtle)",
                }}
              >
                {isLoading && (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "var(--bg-subtle)",
                      animation: "pulse 1.5s infinite",
                    }}
                    aria-label="Loading thumbnail"
                  >
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      Loading…
                    </span>
                  </div>
                )}

                {isError && (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "8px",
                      textAlign: "center",
                    }}
                  >
                    <AlertCircle size={18} color="var(--text-muted)" style={{ marginBottom: "4px" }} />
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: "6px" }}>
                      Failed to load
                    </span>
                    <button
                      type="button"
                      onClick={() => loadSignedUrl(ev)}
                      className="btn-secondary"
                      style={{ minHeight: "26px", padding: "2px 8px", fontSize: "0.72rem" }}
                    >
                      Retry
                    </button>
                  </div>
                )}

                {item?.status === "loaded" && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedIndex(idx);
                      setZoomLevel(1);
                    }}
                    style={{
                      width: "100%",
                      height: "100%",
                      padding: 0,
                      border: "none",
                      background: "none",
                      cursor: "pointer",
                      display: "block",
                      position: "relative",
                    }}
                    aria-label={`Open photo ${idx + 1} of ${evidence.length}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.url}
                      alt={`Report photo ${idx + 1}`}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                        transition: "transform 140ms ease",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.transform = "scale(1.04)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.transform = "scale(1)";
                      }}
                    />
                    {ev.phase && ev.phase !== "report" && (
                      <span
                        style={{
                          position: "absolute",
                          bottom: "4px",
                          left: "4px",
                          padding: "2px 6px",
                          fontSize: "0.68rem",
                          fontWeight: 600,
                          borderRadius: "4px",
                          backgroundColor: "rgba(0, 0, 0, 0.7)",
                          color: "#fff",
                          lineHeight: 1.2,
                        }}
                      >
                        {phaseLabel}
                      </span>
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Full-size Modal Viewer */}
      {selectedIndex !== null && selectedEvidence && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Full-size photo viewer"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.88)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
        >
          {/* Top Bar with details and controls */}
          <div
            style={{
              position: "absolute",
              top: "16px",
              left: "20px",
              right: "20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              color: "#fff",
              zIndex: 1010,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "0.88rem", fontWeight: 500 }}>
                Photo {selectedIndex + 1} of {evidence.length}
              </span>
              {selectedEvidence.phase && (
                <span
                  style={{
                    fontSize: "0.75rem",
                    padding: "2px 8px",
                    borderRadius: "4px",
                    backgroundColor: "rgba(255, 255, 255, 0.2)",
                  }}
                >
                  {selectedEvidence.phase === "before"
                    ? "Before photo"
                    : selectedEvidence.phase === "after"
                    ? "After photo"
                    : "Report photo"}
                </span>
              )}
              {selectedEvidence.taken_at && (
                <span style={{ fontSize: "0.78rem", color: "rgba(255, 255, 255, 0.7)" }}>
                  {formatPhotoDate(selectedEvidence.taken_at)}
                </span>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setZoomLevel((z) => Math.min(z + 0.5, 3))}
                style={{ color: "#fff", padding: "6px" }}
                aria-label="Zoom in"
                disabled={zoomLevel >= 3}
              >
                <ZoomIn size={20} />
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setZoomLevel((z) => Math.max(z - 0.5, 1))}
                style={{ color: "#fff", padding: "6px" }}
                aria-label="Zoom out"
                disabled={zoomLevel <= 1}
              >
                <ZoomOut size={20} />
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setSelectedIndex(null);
                  setZoomLevel(1);
                }}
                style={{ color: "#fff", padding: "6px" }}
                aria-label="Close photo viewer"
              >
                <X size={24} />
              </button>
            </div>
          </div>

          {/* Previous / Next buttons */}
          {selectedIndex > 0 && (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setSelectedIndex(selectedIndex - 1);
                setZoomLevel(1);
              }}
              style={{
                position: "absolute",
                left: "16px",
                color: "#fff",
                zIndex: 1010,
                padding: "10px",
                borderRadius: "50%",
                backgroundColor: "rgba(255, 255, 255, 0.15)",
              }}
              aria-label="Previous photo"
            >
              <ChevronLeft size={28} />
            </button>
          )}

          {selectedIndex < evidence.length - 1 && (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setSelectedIndex(selectedIndex + 1);
                setZoomLevel(1);
              }}
              style={{
                position: "absolute",
                right: "16px",
                color: "#fff",
                zIndex: 1010,
                padding: "10px",
                borderRadius: "50%",
                backgroundColor: "rgba(255, 255, 255, 0.15)",
              }}
              aria-label="Next photo"
            >
              <ChevronRight size={28} />
            </button>
          )}

          {/* Main Image View */}
          <div
            style={{
              maxWidth: "90vw",
              maxHeight: "80vh",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "auto",
            }}
          >
            {selectedPhoto?.status === "loaded" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selectedPhoto.url}
                alt={`Report photo ${selectedIndex + 1}`}
                style={{
                  maxWidth: "100%",
                  maxHeight: "80vh",
                  objectFit: "contain",
                  transform: `scale(${zoomLevel})`,
                  transformOrigin: "center center",
                  transition: "transform 200ms ease",
                  borderRadius: "var(--radius-sm)",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                }}
              />
            ) : selectedPhoto?.status === "error" ? (
              <div
                style={{
                  backgroundColor: "var(--bg-surface)",
                  padding: "24px",
                  borderRadius: "var(--radius-md)",
                  textAlign: "center",
                  maxWidth: "360px",
                }}
              >
                <p style={{ color: "var(--text-ink)", fontWeight: 500, marginBottom: "8px" }}>
                  This photo could not be loaded. Try again.
                </p>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => loadSignedUrl(selectedEvidence)}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                  <RefreshCw size={16} />
                  <span>Retry</span>
                </button>
              </div>
            ) : (
              <div style={{ color: "#fff", display: "flex", alignItems: "center", gap: "8px" }}>
                <span>Loading photo…</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
