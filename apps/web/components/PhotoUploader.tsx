"use client";

import React, { useRef, useState } from "react";
import { Camera, Image as ImageIcon, Trash2, AlertCircle } from "lucide-react";
import imageCompression from "browser-image-compression";

interface PhotoUploaderProps {
  photo: File | null;
  onPhotoSelected: (file: File | null) => void;
  disabled?: boolean;
}

export function PhotoUploader({ photo, onPhotoSelected, disabled = false }: PhotoUploaderProps) {
  const [compressing, setCompressing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const processFile = async (rawFile: File) => {
    setErrorMessage("");

    if (!["image/jpeg", "image/png", "image/jpg"].includes(rawFile.type)) {
      setErrorMessage("Only JPEG and PNG photos are supported.");
      return;
    }

    if (rawFile.size > 8 * 1024 * 1024) {
      setErrorMessage("Photograph must be 8 MiB or smaller.");
      return;
    }

    setCompressing(true);

    try {
      const options = {
        maxSizeMB: 1.8, // Compress to under 2 MB
        maxWidthOrHeight: 1920,
        useWebWorker: true,
        fileType: "image/jpeg" as const,
      };

      const compressedBlob = await imageCompression(rawFile, options);
      const compressedFile = new File([compressedBlob], rawFile.name.replace(/\.[^/.]+$/, ".jpg"), {
        type: "image/jpeg",
        lastModified: Date.now(),
      });

      const url = URL.createObjectURL(compressedFile);
      setPreviewUrl(url);
      onPhotoSelected(compressedFile);
    } catch {
      // If compression fails, fall back to original if under 8 MiB
      const url = URL.createObjectURL(rawFile);
      setPreviewUrl(url);
      onPhotoSelected(rawFile);
    } finally {
      setCompressing(false);
    }
  };

  const handleRemove = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    onPhotoSelected(null);
    setErrorMessage("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      await processFile(droppedFile);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Safety Reminder */}
      <div
        className="banner"
        style={{
          background: "var(--bg-subtle)",
          border: "1px solid var(--border)",
          color: "var(--text-ink)",
          fontSize: "0.8125rem",
        }}
      >
        <span>
          <strong>Safety reminder:</strong> Only take photos when it&apos;s safe to stand there.
        </span>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div role="alert" className="banner banner-error">
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "2px" }} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Hidden Native File Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png"
        style={{ display: "none" }}
        disabled={disabled || compressing}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) processFile(file);
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/jpeg,image/png"
        capture="environment"
        style={{ display: "none" }}
        disabled={disabled || compressing}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) processFile(file);
        }}
      />

      {/* Photo Preview Mode */}
      {photo && previewUrl ? (
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            padding: "16px",
            background: "var(--bg-surface)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "14px", minWidth: 0 }}>
            {/* Thumbnail */}
            <div
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "var(--radius-sm)",
                overflow: "hidden",
                border: "1px solid var(--border)",
                backgroundColor: "var(--bg-subtle)",
                flexShrink: 0,
              }}
            >
              <img
                src={previewUrl}
                alt="Selected preview"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  color: "var(--text-ink)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {photo.name}
              </div>
              <div className="text-muted" style={{ fontSize: "0.75rem", marginTop: "2px" }}>
                {(photo.size / (1024 * 1024)).toFixed(2)} MB · Compressed for upload
              </div>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleRemove}
            disabled={disabled}
            style={{ flexShrink: 0, color: "var(--error)" }}
            aria-label="Remove photo"
          >
            <Trash2 size={16} />
            <span>Remove</span>
          </button>
        </div>
      ) : (
        /* Empty Dropzone / Selectors */
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={{
            border: `2px dashed ${isDragOver ? "var(--primary)" : "var(--border)"}`,
            borderRadius: "var(--radius-md)",
            backgroundColor: isDragOver ? "var(--primary-tint)" : "var(--bg-surface)",
            padding: "32px 20px",
            textAlign: "center",
            transition: "all 150ms ease",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              background: "var(--bg-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 12px",
            }}
          >
            <Camera size={22} style={{ color: "var(--text-muted)" }} />
          </div>

          <div style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-ink)", marginBottom: "4px" }}>
            {compressing ? "Compressing photo…" : "Add a photo"}
          </div>

          <p className="text-muted" style={{ fontSize: "0.8125rem", margin: "0 0 16px" }}>
            Drag and drop a JPEG or PNG here, or choose an option below
          </p>

          <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => cameraInputRef.current?.click()}
              disabled={disabled || compressing}
            >
              <Camera size={16} />
              <span>Take photo</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || compressing}
            >
              <ImageIcon size={16} />
              <span>Choose from gallery</span>
            </button>
          </div>

          <p className="text-muted" style={{ fontSize: "0.75rem", marginTop: "16px", margin: "16px 0 0 0" }}>
            Photos are optional. You can skip this step if you don&apos;t have a photo.
          </p>
        </div>
      )}
    </div>
  );
}
