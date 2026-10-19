"use client";

import React, { useState } from "react";
import type { Category, Client, Detail, Page } from "@grievancegrid/api-client";
import { labels, statusLabel } from "@grievancegrid/api-client";
import {
  AlertTriangleIcon,
  CameraIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  FileTextIcon,
  MapPinIcon,
  RefreshCwIcon,
  SearchIcon,
  ShieldIcon,
} from "./Icons";

interface CitizenFlowProps {
  client: Client;
  page: Page;
  selected: Detail | null;
  onOpen: (tracking: string) => Promise<void>;
  onSubmitComplaint: (data: {
    title: string;
    description: string;
    category: Category;
    latitude: number;
    longitude: number;
    location_text: string;
    location_source: "manual" | "device";
    image_note?: string | null;
    photo?: File | null;
  }) => Promise<void>;
  onUploadPhoto: (tracking: string, file: File) => Promise<void>;
  onRefreshList: () => Promise<void>;
  busy: boolean;
  notice: string;
}

const FOUR_CATEGORIES: Category[] = ["road_damage", "garbage", "waterlogging", "open_drain"];

const CATEGORY_DETAILS: Record<Category, { title: string; desc: string; tag?: string }> = {
  road_damage: {
    title: "Road damage",
    desc: "Potholes, cracks, broken edges.",
  },
  garbage: {
    title: "Garbage",
    desc: "Overflowing bins, dumping.",
  },
  waterlogging: {
    title: "Waterlogging",
    desc: "Water standing on the road.",
  },
  manhole: {
    title: "Manhole or open drain",
    desc: "Missing or broken manhole covers, open drains.",
  },
  open_drain: {
    title: "Manhole or open drain",
    desc: "Missing or broken manhole covers, open drains.",
  },
  damaged_property: {
    title: "Damaged public property",
    desc: "Broken footpaths, road signs, or municipal bus shelters.",
  },
  street_light: {
    title: "Street light",
    desc: "Non-functioning, dark, or flickering public street lights and poles.",
  },
  water_supply: {
    title: "Water supply",
    desc: "Pipeline leakages or contaminated public drinking water.",
  },
  other: {
    title: "Other",
    desc: "General civic issues not covered by standard municipal categories.",
  },
};

export function CitizenFlow({
  client,
  page,
  selected,
  onOpen,
  onSubmitComplaint,
  onUploadPhoto,
  onRefreshList,
  busy,
  notice,
}: CitizenFlowProps) {
  // Stepper state: 1: Category, 2: Describe, 3: Location, 4: Evidence, 5: Review
  const [step, setStep] = useState<number>(1);

  // Form state
  const [category, setCategory] = useState<Category>("road_damage");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [locationText, setLocationText] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [locationSource, setLocationSource] = useState<"manual" | "device">("manual");
  const [locating, setLocating] = useState(false);
  const [locationAccuracy, setLocationAccuracy] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [imageNote, setImageNote] = useState("");
  const [formError, setFormError] = useState("");
  const [showManualCoords, setShowManualCoords] = useState(false);
  const [lookupId, setLookupId] = useState("");
  const [copiedTracking, setCopiedTracking] = useState(false);
  const [newPhotoFile, setNewPhotoFile] = useState<File | null>(null);

  const handleLocate = () => {
    if (!navigator.geolocation) {
      setFormError("Geolocation is not supported by your browser. Please enter coordinates manually.");
      setShowManualCoords(true);
      return;
    }
    setLocating(true);
    setFormError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude.toFixed(6));
        setLongitude(position.coords.longitude.toFixed(6));
        setLocationSource("device");
        setLocationAccuracy(`Accuracy ±${Math.round(position.coords.accuracy)}m`);
        setLocating(false);
      },
      () => {
        setLocating(false);
        setFormError("Could not retrieve current location. Please enter landmarks or coordinates manually.");
        setShowManualCoords(true);
      },
      { timeout: 12000, enableHighAccuracy: true }
    );
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setFormError("Please select a JPEG or PNG image.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setFormError("The selected photograph exceeds the 8 MiB limit.");
      return;
    }
    setFormError("");
    setPhoto(file);
  };

  const validateStep = (current: number): boolean => {
    setFormError("");
    if (current === 1) {
      return !!category;
    }
    if (current === 2) {
      if (title.trim().length < 5) {
        setFormError("Title must be at least 5 characters.");
        return false;
      }
      if (description.trim().length < 20) {
        setFormError("Description must be at least 20 characters to assist municipal officers.");
        return false;
      }
      return true;
    }
    if (current === 3) {
      if (locationText.trim().length < 5) {
        setFormError("Please provide a readable landmark or street description.");
        return false;
      }
      if (!latitude || !longitude || isNaN(Number(latitude)) || isNaN(Number(longitude))) {
        setFormError("Valid coordinates are required. Use 'Detect my current position' or enter manually.");
        setShowManualCoords(true);
        return false;
      }
      return true;
    }
    return true;
  };

  const nextStep = () => {
    if (validateStep(step)) {
      setStep((prev) => Math.min(prev + 1, 5));
    }
  };

  const prevStep = () => {
    setFormError("");
    setStep((prev) => Math.max(prev - 1, 1));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep(2) || !validateStep(3)) return;
    await onSubmitComplaint({
      title: title.trim(),
      description: description.trim(),
      category,
      latitude: Number(latitude),
      longitude: Number(longitude),
      location_text: locationText.trim(),
      location_source: locationSource,
      image_note: imageNote.trim() || null,
      photo,
    });
    // Reset form after successful submission
    setTitle("");
    setDescription("");
    setLocationText("");
    setLatitude("");
    setLongitude("");
    setPhoto(null);
    setImageNote("");
    setStep(1);
  };

  const copyTrackingId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedTracking(true);
    setTimeout(() => setCopiedTracking(false), 2000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>

      {notice && (
        <div role="status" className="banner banner-notice">
          <CheckCircleIcon size={20} style={{ color: "var(--success)", flexShrink: 0 }} />
          <span>{notice}</span>
        </div>
      )}

      {/* Main Grid: Form / Stepper (Left) vs Detail & Reports (Right) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "24px", alignItems: "start" }}>
        
        {/* Step-by-Step Reporting Form */}
        <section className="panel" aria-labelledby="report-stepper-heading">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <div>
              <h2 id="report-stepper-heading">Lodge a civic grievance</h2>
              <p className="text-muted" style={{ fontSize: "0.85rem" }}>
                Step {step} of 5 · {step === 1 ? "Category" : step === 2 ? "Description" : step === 3 ? "Location" : step === 4 ? "Evidence" : "Review"}
              </p>
            </div>
          </div>

          {/* Stepper Progress Indicator */}
          <nav aria-label="Complaint progress" className="stepper">
            {[1, 2, 3, 4, 5].map((s) => (
              <button
                type="button"
                key={s}
                className={`step-item ${step === s ? "active" : step > s ? "completed" : ""}`}
                onClick={() => {
                  if (s < step) setStep(s);
                }}
                disabled={busy}
                aria-current={step === s ? "step" : undefined}
                aria-label={`Step ${s}: ${s === 1 ? "Category" : s === 2 ? "Describe" : s === 3 ? "Location" : s === 4 ? "Evidence" : "Review"}`}
              >
                <span className="step-circle">{step > s ? "✓" : s}</span>
                <span className="step-label">
                  {s === 1 ? "Category" : s === 2 ? "Describe" : s === 3 ? "Location" : s === 4 ? "Evidence" : "Review"}
                </span>
              </button>
            ))}
          </nav>

          {formError && (
            <div role="alert" className="banner banner-error" style={{ marginBottom: "16px" }}>
              <AlertTriangleIcon size={18} style={{ flexShrink: 0 }} />
              <span>{formError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* STEP 1: CATEGORY */}
            {step === 1 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <p style={{ fontWeight: 600, fontSize: "0.95rem" }}>Select the civic issue category:</p>
                <div className="category-grid">
                  {FOUR_CATEGORIES.map((catKey) => {
                    const info = CATEGORY_DETAILS[catKey];
                    const isSelected = category === catKey;
                    return (
                      <div
                        key={catKey}
                        className={`category-card ${isSelected ? "selected" : ""}`}
                        onClick={() => setCategory(catKey)}
                        role="radio"
                        aria-checked={isSelected}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === " " || e.key === "Enter") setCategory(catKey);
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <span style={{ fontWeight: 600, color: isSelected ? "var(--primary-text)" : "var(--text-ink)" }}>
                            {info.title}
                          </span>
                          {info.tag && (
                            <span className="badge badge-submitted" style={{ fontSize: "0.7rem", padding: "1px 6px" }}>
                              {info.tag}
                            </span>
                          )}
                        </div>
                        <p className="text-muted" style={{ fontSize: "0.825rem", marginTop: "4px" }}>
                          {info.desc}
                        </p>
                      </div>
                    );
                  })}
                </div>
                <p className="text-muted" style={{ fontSize: "0.875rem", marginTop: "12px", lineHeight: 1.5 }}>
                  We can only take these four kinds of problems for now. For anything else, please contact your local office.
                </p>
              </div>
            )}

            {/* STEP 2: DESCRIBE */}
            {step === 2 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <label>
                  <span>Title / Summary (min 5 characters)</span>
                  <input
                    type="text"
                    required
                    minLength={5}
                    maxLength={160}
                    placeholder="e.g. Hazardous pothole at junction of 4th Cross"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    disabled={busy}
                  />
                  <span className="text-muted" style={{ fontSize: "0.775rem", alignSelf: "flex-end" }}>
                    {title.length}/160
                  </span>
                </label>

                <label>
                  <span>Detailed description (min 20 characters)</span>
                  <textarea
                    required
                    minLength={20}
                    maxLength={5000}
                    rows={4}
                    placeholder="Describe severity, dimensions, hazards to commuters, and duration of the problem..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={busy}
                  />
                  <span className="text-muted" style={{ fontSize: "0.775rem", alignSelf: "flex-end" }}>
                    {description.length}/5000
                  </span>
                </label>
              </div>
            )}

            {/* STEP 3: LOCATION */}
            {step === 3 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <label>
                  <span>Landmark / Street Address</span>
                  <input
                    type="text"
                    required
                    minLength={5}
                    maxLength={240}
                    placeholder="e.g. Near St. Jude School Gate, 4th Main Road"
                    value={locationText}
                    onChange={(e) => setLocationText(e.target.value)}
                    disabled={busy}
                  />
                </label>

                <div className="panel" style={{ backgroundColor: "var(--bg-subtle)", padding: "16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>Geographic Coordinates</span>
                    {locationAccuracy && (
                      <span className="badge badge-resolved" style={{ fontSize: "0.75rem" }}>
                        {locationAccuracy}
                      </span>
                    )}
                  </div>

                  <p className="text-muted" style={{ fontSize: "0.825rem", marginBottom: "12px" }}>
                    Accurate coordinates allow municipal survey teams to locate the problem quickly.
                  </p>

                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleLocate}
                    disabled={busy || locating}
                    style={{ width: "100%", marginBottom: "10px" }}
                  >
                    <MapPinIcon size={18} />
                    {locating ? "Detecting GPS fix…" : "Detect my current position"}
                  </button>

                  {latitude && longitude && (
                    <div style={{ padding: "8px 12px", background: "var(--bg-surface)", borderRadius: "var(--radius-sm)", fontSize: "0.85rem", border: "1px solid var(--border)", marginBottom: "10px" }}>
                      <strong>Active fix:</strong> <span className="tabular">{latitude}, {longitude}</span> ({locationSource})
                    </div>
                  )}

                  <div style={{ textAlign: "right" }}>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => setShowManualCoords(!showManualCoords)}
                      style={{ padding: "4px 8px", fontSize: "0.8rem", minHeight: "32px" }}
                    >
                      {showManualCoords ? "Hide manual coordinate entry" : "Enter coordinates manually"}
                    </button>
                  </div>

                  {showManualCoords && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "10px" }}>
                      <label>
                        <span style={{ fontSize: "0.8rem" }}>Latitude</span>
                        <input
                          type="number"
                          step="any"
                          min={-90}
                          max={90}
                          placeholder="e.g. 12.9716"
                          value={latitude}
                          onChange={(e) => {
                            setLatitude(e.target.value);
                            setLocationSource("manual");
                          }}
                          disabled={busy}
                        />
                      </label>
                      <label>
                        <span style={{ fontSize: "0.8rem" }}>Longitude</span>
                        <input
                          type="number"
                          step="any"
                          min={-180}
                          max={180}
                          placeholder="e.g. 77.5946"
                          value={longitude}
                          onChange={(e) => {
                            setLongitude(e.target.value);
                            setLocationSource("manual");
                          }}
                          disabled={busy}
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* STEP 4: EVIDENCE */}
            {step === 4 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div className="banner" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", fontSize: "0.85rem" }}>
                  <span>
                    <strong>Safety note:</strong> Only photograph civic issues when it is safe to do so. Please use an original photo taken at the place. Missing photos will not block registration.
                  </span>
                </div>

                <label>
                  <span>Attach photograph (Optional, JPEG/PNG up to 8 MiB)</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png"
                    onChange={handlePhotoSelect}
                    disabled={busy}
                    style={{ padding: "8px" }}
                  />
                </label>

                {photo && (
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px", background: "var(--bg-subtle)", borderRadius: "var(--radius-sm)" }}>
                    <CameraIcon size={20} style={{ color: "var(--primary)" }} />
                    <div style={{ flex: 1, minWidth: 0, fontSize: "0.85rem" }}>
                      <strong>{photo.name}</strong> ({(photo.size / 1024 / 1024).toFixed(2)} MiB)
                    </div>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => setPhoto(null)}
                      style={{ padding: "4px 8px", minHeight: "32px", fontSize: "0.8rem" }}
                    >
                      Remove
                    </button>
                  </div>
                )}

                <label>
                  <span>Evidence or safety note (Optional)</span>
                  <input
                    type="text"
                    maxLength={500}
                    placeholder="e.g. Unable to approach curb due to heavy traffic; photo taken from opposite pavement"
                    value={imageNote}
                    onChange={(e) => setImageNote(e.target.value)}
                    disabled={busy}
                  />
                </label>
              </div>
            )}

            {/* STEP 5: REVIEW & SUBMIT */}
            {step === 5 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ background: "var(--bg-subtle)", borderRadius: "var(--radius-md)", padding: "16px" }}>
                  <h3 style={{ marginBottom: "12px" }}>Summary of your report</h3>
                  <dl style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: "8px", fontSize: "0.875rem" }}>
                    <dt className="text-muted">Category:</dt>
                    <dd style={{ fontWeight: 600 }}>{labels[category]}</dd>

                    <dt className="text-muted">Title:</dt>
                    <dd>{title}</dd>

                    <dt className="text-muted">Description:</dt>
                    <dd style={{ whiteSpace: "pre-wrap" }}>{description}</dd>

                    <dt className="text-muted">Location:</dt>
                    <dd>
                      {locationText}
                      <br />
                      <span className="tabular text-muted" style={{ fontSize: "0.8rem" }}>
                        {latitude}, {longitude} ({locationSource})
                      </span>
                    </dd>

                    <dt className="text-muted">Photograph:</dt>
                    <dd>{photo ? `${photo.name} (${(photo.size / 1024 / 1024).toFixed(2)} MiB)` : "None attached"}</dd>

                    {imageNote && (
                      <>
                        <dt className="text-muted">Safety note:</dt>
                        <dd>{imageNote}</dd>
                      </>
                    )}
                  </dl>
                </div>

                <div className="banner" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", fontSize: "0.85rem" }}>
                  <span>
                    <strong>Submission notice:</strong> You will immediately receive an official tracking ID. An assigned municipal officer reviews every report and certifies the verified outcome.
                  </span>
                </div>
              </div>
            )}

            {/* Step Navigation Controls */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "24px", paddingTop: "16px", borderTop: "1px solid var(--border)" }}>
              {step > 1 ? (
                <button type="button" className="btn-secondary" onClick={prevStep} disabled={busy}>
                  <ChevronLeftIcon size={18} />
                  Back
                </button>
              ) : (
                <div />
              )}

              {step < 5 ? (
                <button type="button" className="btn-primary" onClick={nextStep} disabled={busy}>
                  Next
                  <ChevronRightIcon size={18} />
                </button>
              ) : (
                <button type="submit" className="btn-primary" disabled={busy}>
                  {busy ? "Submitting grievance…" : "Submit grievance"}
                </button>
              )}
            </div>
          </form>
        </section>

        {/* Right Column: Reports & Detail */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          
          {/* Tracking ID Quick Lookup */}
          <section className="panel" aria-labelledby="lookup-heading">
            <h3 id="lookup-heading" style={{ marginBottom: "8px" }}>Track an existing complaint</h3>
            <p className="text-muted" style={{ fontSize: "0.825rem", marginBottom: "12px" }}>
              Enter any GrievanceGrid reference number to view official status logs.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (lookupId.trim()) onOpen(lookupId.trim());
              }}
              style={{ display: "flex", gap: "8px" }}
            >
              <input
                type="text"
                required
                placeholder="e.g. GG-2026-A1B2C3"
                value={lookupId}
                onChange={(e) => setLookupId(e.target.value)}
                disabled={busy}
                style={{ flex: 1 }}
              />
              <button type="submit" className="btn-secondary" disabled={busy || !lookupId.trim()}>
                <SearchIcon size={18} />
                Find
              </button>
            </form>
          </section>

          {/* Active Detail View */}
          {selected && (
            <article className="panel" aria-labelledby="detail-heading">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px", marginBottom: "12px" }}>
                <div>
                  <h3 id="detail-heading">{selected.title}</h3>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                    <span className="tabular" style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--primary-text)" }}>
                      {selected.tracking_id}
                    </span>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => copyTrackingId(selected.tracking_id)}
                      style={{ padding: "2px 6px", minHeight: "26px", fontSize: "0.75rem" }}
                      title="Copy reference number"
                    >
                      <CopyIcon size={14} />
                      {copiedTracking ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>
                <span className={`badge badge-${selected.status}`}>
                  {statusLabel(selected.status)}
                </span>
              </div>

              <p style={{ fontSize: "0.925rem", whiteSpace: "pre-wrap", marginBottom: "16px" }}>
                {selected.description}
              </p>

              <dl style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: "6px", fontSize: "0.825rem", borderTop: "1px solid var(--border)", paddingTop: "12px", marginBottom: "16px" }}>
                <dt className="text-muted">Category:</dt>
                <dd>{labels[selected.category]}</dd>

                <dt className="text-muted">Location:</dt>
                <dd>
                  {selected.location_text}
                  <br />
                  <span className="tabular text-muted">
                    {selected.latitude}, {selected.longitude} ({selected.location_source})
                  </span>
                </dd>

                <dt className="text-muted">Lodged on:</dt>
                <dd>{new Date(selected.received_at).toLocaleString()}</dd>

                <dt className="text-muted">Analysis:</dt>
                <dd>Disabled · manual municipal review</dd>
              </dl>

              {/* Photos & Evidence */}
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: "12px", marginBottom: "16px" }}>
                <h4 style={{ fontSize: "0.9rem", marginBottom: "8px" }}>Submitted Photographs</h4>
                {!selected.evidence.length ? (
                  <p className="text-muted" style={{ fontSize: "0.825rem" }}>No photographs attached to this complaint.</p>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "10px" }}>
                    {selected.evidence.map((ev) => (
                      <a
                        key={ev.id}
                        href={client.evidenceUrl(selected.tracking_id, ev.id)}
                        target="_blank"
                        rel="noreferrer"
                        style={{ display: "block", textDecoration: "none" }}
                      >
                        <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "10px", background: "var(--bg-subtle)", textAlign: "center", fontSize: "0.75rem" }}>
                          <CameraIcon size={24} style={{ color: "var(--primary)", margin: "0 auto 4px" }} />
                          <span>View photo ({(ev.size_bytes / 1024).toFixed(0)} KB)</span>
                        </div>
                      </a>
                    ))}
                  </div>
                )}

                {/* Add Photo retry if < 5 */}
                {selected.evidence.length < 5 && (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (newPhotoFile) {
                        await onUploadPhoto(selected.tracking_id, newPhotoFile);
                        setNewPhotoFile(null);
                      }
                    }}
                    style={{ marginTop: "12px", display: "flex", gap: "8px", alignItems: "center" }}
                  >
                    <input
                      type="file"
                      accept="image/jpeg,image/png"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) setNewPhotoFile(f);
                      }}
                      disabled={busy}
                      style={{ fontSize: "0.8rem", padding: "6px" }}
                    />
                    <button
                      type="submit"
                      className="btn-secondary"
                      disabled={busy || !newPhotoFile}
                      style={{ minHeight: "36px", padding: "6px 12px", fontSize: "0.8rem", flexShrink: 0 }}
                    >
                      Upload
                    </button>
                  </form>
                )}
              </div>

              {/* Status Timeline */}
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: "12px" }}>
                <h4 style={{ fontSize: "0.9rem", marginBottom: "8px" }}>Official Status Timeline</h4>
                <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "12px" }}>
                  {selected.events.map((evt) => (
                    <li
                      key={evt.id}
                      style={{
                        paddingLeft: "14px",
                        borderLeft: "2px solid var(--border)",
                        fontSize: "0.85rem",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span className={`badge badge-${evt.status}`} style={{ fontSize: "0.75rem", padding: "1px 6px" }}>
                          {statusLabel(evt.status)}
                        </span>
                        <span className="text-muted tabular" style={{ fontSize: "0.75rem" }}>
                          {new Date(evt.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p style={{ marginTop: "4px", fontSize: "0.85rem", whiteSpace: "pre-wrap" }}>
                        {evt.note}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>
            </article>
          )}

          {/* List of Citizen's Past Complaints */}
          <section className="panel" aria-labelledby="history-heading">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <div>
                <h3 id="history-heading">Your complaint history</h3>
                <p className="text-muted" style={{ fontSize: "0.8rem" }}>
                  {page.total} record{page.total === 1 ? "" : "s"} found · Latest received first
                </p>
              </div>
              <button
                type="button"
                className="btn-ghost"
                onClick={onRefreshList}
                disabled={busy}
                style={{ padding: "6px 10px", minHeight: "36px", fontSize: "0.8rem" }}
              >
                <RefreshCwIcon size={16} />
                Refresh
              </button>
            </div>

            {!page.items.length ? (
              <div style={{ textAlign: "center", padding: "30px 10px" }}>
                <FileTextIcon size={32} style={{ color: "var(--text-muted)", margin: "0 auto 8px" }} />
                <p style={{ fontWeight: 600, fontSize: "0.925rem" }}>No reports filed yet</p>
                <p className="text-muted" style={{ fontSize: "0.825rem" }}>
                  When you report a problem, you will see its status updates and officer responses here.
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {page.items.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => onOpen(item.tracking_id)}
                    style={{
                      padding: "12px 14px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--border)",
                      background: selected?.id === item.id ? "var(--primary-tint)" : "var(--bg-surface)",
                      cursor: "pointer",
                      transition: "all 140ms ease",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                      <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>{item.title}</span>
                      <span className={`badge badge-${item.status}`} style={{ fontSize: "0.75rem" }}>
                        {statusLabel(item.status)}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "6px", fontSize: "0.775rem" }} className="text-muted">
                      <span className="tabular">{item.tracking_id}</span>
                      <span>{new Date(item.received_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

        </div>
      </div>
    </div>
  );
}
