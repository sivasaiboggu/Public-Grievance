"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  AlertTriangle,
  Trash2,
  Droplets,
  Disc,
} from "lucide-react";
import type { Category } from "@grievancegrid/api-client";
import { getApiClient } from "../../../../lib/api";
import { ReadingContainer } from "../../../../components/Layout";
import { LocationPicker } from "../../../../components/LocationPicker";
import { PhotoUploader } from "../../../../components/PhotoUploader";
import { CATEGORY_METADATA } from "../../../../lib/labels";

const STEPS = [
  { step: 1, name: "Category" },
  { step: 2, name: "Details" },
  { step: 3, name: "Location" },
  { step: 4, name: "Photo" },
  { step: 5, name: "Review" },
];

interface DynamicCategory {
  id: string;
  code: string;
  label: string;
  description: string;
  target_hours: number;
  icon: string;
  photo_rule?: "required" | "recommended" | "optional";
}

const DEFAULT_CATEGORIES: DynamicCategory[] = [
  { id: "1", code: "road_damage", label: "Road damage", description: "Potholes, cracks, broken edges.", target_hours: 48, icon: "AlertTriangle", photo_rule: "required" },
  { id: "2", code: "garbage", label: "Garbage", description: "Overflowing bins, dumping.", target_hours: 24, icon: "Trash2", photo_rule: "required" },
  { id: "3", code: "waterlogging", label: "Waterlogging", description: "Water standing on the road.", target_hours: 48, icon: "Droplets", photo_rule: "required" },
  { id: "4", code: "open_drain", label: "Manhole or open drain", description: "Missing or broken manhole covers, open drains.", target_hours: 24, icon: "CircleDot", photo_rule: "required" },
];

export default function ReportStepperPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [categoriesList, setCategoriesList] = useState<DynamicCategory[]>(DEFAULT_CATEGORIES);

  useEffect(() => {
    const fetchCats = async () => {
      try {
        const res = await fetch("/api/v1/categories");
        if (res.ok) {
          const data = await res.json();
          if (data.length > 0) {
            setCategoriesList(data);
          }
        }
      } catch {
        // Fallback to defaults
      }
    };
    fetchCats();
  }, []);

  // Form Fields
  const [category, setCategory] = useState<Category>("road_damage");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [landmark, setLandmark] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [locationSource, setLocationSource] = useState<"manual" | "device">("manual");
  const [photo, setPhoto] = useState<File | null>(null);
  const [cannotTakeSafely, setCannotTakeSafely] = useState(false);
  const [safetyReason, setSafetyReason] = useState("");

  const progressPercent = (currentStep / STEPS.length) * 100;
  const stepMeta = STEPS[currentStep - 1];

  const handleNext = () => {
    if (currentStep === 2) {
      if (title.trim().length < 5) {
        toast.error("Please enter a title of at least 5 characters.");
        return;
      }
      if (description.trim().length < 20) {
        toast.error("Please describe the problem in at least 20 characters.");
        return;
      }
    }
    if (currentStep === 3) {
      if (latitude === null || longitude === null) {
        toast.error("Please choose a location on the map or tap 'Use my current location'.");
        return;
      }
      if (landmark.trim().length < 5) {
        toast.error("Please provide a street address or landmark of at least 5 characters.");
        return;
      }
    }
    if (currentStep === 4) {
      const isRequired = selectedCategoryMeta?.photo_rule === "required";
      if (isRequired && !photo && !cannotTakeSafely) {
        toast.error("A photo is required for this category. If you cannot take one safely, select 'I can't take a photo safely'.");
        return;
      }
      if (cannotTakeSafely && !photo && safetyReason.trim().length < 5) {
        toast.error("Please provide a short reason why you cannot take a photo safely.");
        return;
      }
    }
    setCurrentStep((prev) => Math.min(prev + 1, STEPS.length));
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleSubmit = async () => {
    if (latitude === null || longitude === null) {
      toast.error("Location is missing. Please go back to step 3.");
      return;
    }

    setBusy(true);
    try {
      const client = getApiClient();
      const requestId = crypto.randomUUID();
      const result = await client.submit({
        client_request_id: requestId,
        title: title.trim(),
        description: description.trim(),
        category,
        latitude,
        longitude,
        location_text: landmark.trim(),
        location_source: locationSource,
        image_note: cannotTakeSafely && !photo ? safetyReason.trim() : undefined,
      });

      // Upload photo if selected
      if (photo) {
        try {
          const form = new FormData();
          form.append("file", photo);
          await client.upload(result.tracking_id, form);
        } catch {
          toast.warning("Report was saved, but the photo upload failed. You can add it later.");
        }
      }

      toast.success(`Report submitted. Reference: ${result.tracking_id}`);
      router.push(`/citizen/reports/${result.tracking_id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not submit report. Please retry.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const selectedCategoryMeta = categoriesList.find((c) => c.code === category);

  return (
    <ReadingContainer>
      {/* Back to Home Link */}
      <Link
        href="/citizen"
        className="btn-ghost"
        style={{
          display: "inline-flex",
          gap: "6px",
          padding: "6px 0",
          marginBottom: "16px",
          textDecoration: "none",
        }}
      >
        <ArrowLeft size={16} />
        <span>Back to my reports</span>
      </Link>

      {/* Stepper Header with Progress Bar */}
      <div className="stepper-header">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 600, margin: 0 }}>What is the problem?</h1>
          <span className="text-muted tabular" style={{ fontSize: "0.875rem" }}>
            Step {currentStep} of {STEPS.length} · {stepMeta.name}
          </span>
        </div>
        <div className="stepper-progress">
          <div className="stepper-progress-fill" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      <div className="card" style={{ padding: "clamp(20px, 3vw, 32px)" }}>
        {/* STEP 1: CATEGORY */}
        {currentStep === 1 && (
          <div>
            <h2 style={{ fontSize: "1.25rem", marginBottom: "6px" }}>Select category</h2>
            <p className="text-muted" style={{ marginBottom: "20px" }}>
              Choose the category that best matches the issue.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {categoriesList.map((item) => {
                const isSelected = category === item.code;
                return (
                  <label
                    key={item.id || item.code}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "14px",
                      padding: "14px 16px",
                      border: `1px solid ${isSelected ? "var(--primary)" : "var(--border)"}`,
                      borderRadius: "var(--radius-sm)",
                      backgroundColor: isSelected ? "var(--primary-tint)" : "var(--bg-surface)",
                      cursor: "pointer",
                      transition: "all 140ms ease",
                    }}
                  >
                    <input
                      type="radio"
                      name="category"
                      value={item.code}
                      checked={isSelected}
                      onChange={() => setCategory(item.code as Category)}
                      style={{ marginTop: "4px", width: "auto", minHeight: "auto" }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontWeight: 600, color: "var(--text-ink)" }}>{item.label}</span>
                      </div>
                      <p className="text-muted" style={{ fontSize: "0.8125rem", marginTop: "3px", margin: "3px 0 0" }}>
                        {item.description}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
            <p className="text-muted" style={{ fontSize: "0.875rem", marginTop: "16px", lineHeight: 1.5 }}>
              We can only take these four kinds of problems for now. For anything else, please contact your local office.
            </p>
          </div>
        )}

        {/* STEP 2: DETAILS */}
        {currentStep === 2 && (
          <div>
            <h2 style={{ fontSize: "1.25rem", marginBottom: "6px" }}>Describe the problem</h2>
            <p className="text-muted" style={{ marginBottom: "20px" }}>
              Provide clear details to help the field team locate and assess the issue.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              <div className="form-group">
                <label htmlFor="title">Short title</label>
                <input
                  id="title"
                  type="text"
                  required
                  placeholder="e.g. Deep pothole near main bus stop curb"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={160}
                />
                <span className="text-muted" style={{ fontSize: "0.75rem", alignSelf: "flex-end" }}>
                  {title.length}/160
                </span>
              </div>

              <div className="form-group">
                <label htmlFor="description">Detailed description</label>
                <textarea
                  id="description"
                  required
                  rows={4}
                  placeholder="Describe the size, depth, how long it has been there, or any safety hazard observed..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={2000}
                />
                <span className="text-muted" style={{ fontSize: "0.75rem", alignSelf: "flex-end" }}>
                  Min 20 characters ({description.length}/2000)
                </span>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: LOCATION (Where is it?) */}
        {currentStep === 3 && (
          <div>
            <h2 style={{ fontSize: "1.25rem", marginBottom: "6px" }}>Where is it?</h2>
            <p className="text-muted" style={{ marginBottom: "20px" }}>
              Use your device location or adjust the pin directly on the map.
            </p>

            <LocationPicker
              latitude={latitude}
              longitude={longitude}
              accuracy={accuracy}
              locationSource={locationSource}
              landmark={landmark}
              onLocationChange={(lat, lng, source, acc) => {
                setLatitude(lat);
                setLongitude(lng);
                setLocationSource(source);
                if (acc !== undefined) setAccuracy(acc);
              }}
              onLandmarkChange={(text) => setLandmark(text)}
            />
          </div>
        )}

        {/* STEP 4: PHOTO STEP */}
        {currentStep === 4 && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "6px" }}>
              <h2 style={{ fontSize: "1.25rem", margin: 0 }}>Add a photo</h2>
              {selectedCategoryMeta?.photo_rule && (
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: "10px",
                    backgroundColor:
                      selectedCategoryMeta.photo_rule === "required"
                        ? "var(--priority-high-subtle, rgba(194, 84, 10, 0.1))"
                        : "var(--bg-subtle)",
                    color:
                      selectedCategoryMeta.photo_rule === "required"
                        ? "var(--priority-high, #C2540A)"
                        : "var(--text-muted)",
                  }}
                >
                  {selectedCategoryMeta.photo_rule === "required"
                    ? "Photo required"
                    : selectedCategoryMeta.photo_rule === "recommended"
                    ? "Photo recommended"
                    : "Photo optional"}
                </span>
              )}
            </div>
            <p className="text-muted" style={{ marginBottom: "20px" }}>
              {selectedCategoryMeta?.photo_rule === "required"
                ? "A photo is required for this category so officers can verify and dispatch the right team."
                : "A photo helps field workers identify the scale of work needed."}
            </p>

            <PhotoUploader
              photo={photo}
              onPhotoSelected={(f) => {
                setPhoto(f);
                if (f) {
                  setCannotTakeSafely(false);
                  setSafetyReason("");
                }
              }}
              disabled={busy}
            />

            {photo && (
              <div
                style={{
                  marginTop: "12px",
                  padding: "10px 14px",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: "var(--bg-subtle)",
                  border: "1px solid var(--border)",
                  fontSize: "13px",
                  color: "var(--text-muted)",
                  lineHeight: 1.5,
                }}
              >
                Municipal software checks photos to confirm they match the selected category ({selectedCategoryMeta?.label}). If a different issue is detected, the reviewing officer can reassign it.
              </div>
            )}

            {/* Calm link: I can't take a photo safely */}
            {!photo && (
              <div style={{ marginTop: "16px" }}>
                {!cannotTakeSafely ? (
                  <button
                    type="button"
                    onClick={() => setCannotTakeSafely(true)}
                    className="btn-ghost"
                    style={{
                      fontSize: "0.85rem",
                      color: "var(--primary)",
                      padding: "4px 0",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      textDecoration: "underline",
                    }}
                  >
                    I can&apos;t take a photo safely
                  </button>
                ) : (
                  <div
                    style={{
                      padding: "14px",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      backgroundColor: "var(--bg-subtle)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                      <label htmlFor="safety-reason" style={{ fontSize: "0.825rem", fontWeight: 600, color: "var(--text-ink)" }}>
                        Why can&apos;t you take a photo safely?
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setCannotTakeSafely(false);
                          setSafetyReason("");
                        }}
                        className="btn-ghost"
                        style={{ fontSize: "0.75rem", padding: "2px 6px" }}
                      >
                        Cancel
                      </button>
                    </div>
                    <input
                      id="safety-reason"
                      type="text"
                      placeholder="e.g. Heavy traffic, night time, flood waters"
                      value={safetyReason}
                      onChange={(e) => setSafetyReason(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        fontSize: "0.85rem",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border)",
                        boxSizing: "border-box",
                      }}
                    />
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "4px", display: "block" }}>
                      Your report will proceed directly for officer manual review.
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* STEP 5: REVIEW */}
        {currentStep === 5 && (
          <div>
            <h2 style={{ fontSize: "1.25rem", marginBottom: "6px" }}>Review your report</h2>
            <p className="text-muted" style={{ marginBottom: "24px" }}>
              Confirm the details below before submitting.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  paddingBottom: "12px",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <div>
                  <span className="text-muted" style={{ fontSize: "0.75rem", display: "block" }}>
                    Category
                  </span>
                  <span style={{ fontWeight: 500 }}>{selectedCategoryMeta?.label}</span>
                </div>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setCurrentStep(1)}
                  style={{ minHeight: "32px", fontSize: "0.8125rem" }}
                >
                  Change
                </button>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  paddingBottom: "12px",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <div style={{ minWidth: 0, paddingRight: "12px" }}>
                  <span className="text-muted" style={{ fontSize: "0.75rem", display: "block" }}>
                    Summary
                  </span>
                  <span style={{ fontWeight: 500, display: "block", overflowWrap: "anywhere" }}>
                    {title}
                  </span>
                  <p
                    className="text-muted"
                    style={{
                      fontSize: "0.8125rem",
                      marginTop: "4px",
                      margin: "4px 0 0",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {description}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setCurrentStep(2)}
                  style={{ minHeight: "32px", fontSize: "0.8125rem", flexShrink: 0 }}
                >
                  Change
                </button>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  paddingBottom: "12px",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <div>
                  <span className="text-muted" style={{ fontSize: "0.75rem", display: "block" }}>
                    Location
                  </span>
                  <span style={{ fontWeight: 500, display: "block" }}>{landmark}</span>
                  {latitude !== null && longitude !== null && (
                    <span
                      className="text-muted tabular"
                      style={{ fontSize: "0.8125rem", display: "block", marginTop: "2px" }}
                    >
                      {latitude.toFixed(4)}° N, {longitude.toFixed(4)}° E
                      {accuracy ? ` · accurate to about ${Math.round(accuracy)} m` : ""}
                      {` · from ${locationSource}`}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setCurrentStep(3)}
                  style={{ minHeight: "32px", fontSize: "0.8125rem" }}
                >
                  Change
                </button>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <span className="text-muted" style={{ fontSize: "0.75rem", display: "block" }}>
                    Photo
                  </span>
                  <span style={{ fontWeight: 500 }}>
                    {photo ? `${photo.name} (${(photo.size / (1024 * 1024)).toFixed(2)} MB)` : "No photo added"}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setCurrentStep(4)}
                  style={{ minHeight: "32px", fontSize: "0.8125rem" }}
                >
                  Change
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Stepper Navigation Buttons */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "32px",
            paddingTop: "20px",
            borderTop: "1px solid var(--border)",
          }}
        >
          {currentStep > 1 ? (
            <button type="button" className="btn btn-secondary" onClick={handleBack} disabled={busy}>
              <ArrowLeft size={16} />
              <span>Back</span>
            </button>
          ) : (
            <div />
          )}

          {currentStep < STEPS.length ? (
            <button type="button" className="btn btn-primary" onClick={handleNext}>
              <span>Next</span>
              <ArrowRight size={16} />
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={busy}>
              <CheckCircle size={16} />
              <span>{busy ? "Submitting…" : "Submit report"}</span>
            </button>
          )}
        </div>
      </div>
    </ReadingContainer>
  );
}
