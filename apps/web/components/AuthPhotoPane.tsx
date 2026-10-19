"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import Image from "next/image";
import { Play, Pause } from "lucide-react";
import { Wordmark } from "./Wordmark";
import rawSlides from "../public/images/auth/slides.json";

export interface SlideItem {
  id: string;
  category: string;
  caption: string;
  alt: string;
  focalPoint: { x: number; y: number };
  aspectRatio: string;
  blurDataURL: string;
  defaultSrc: string;
  srcset: {
    avif: string;
    webp: string;
    jpeg: string;
  };
}

const slides: SlideItem[] = rawSlides as SlideItem[];

interface AuthPhotoPaneProps {
  headline?: React.ReactNode;
  supportText?: string;
}

export function AuthPhotoPane({
  headline = (
    <>
      Report it. Track it.
      <br />
      See it fixed.
    </>
  ),
  supportText = "Tell the city about a problem and follow it until it is fixed.",
}: AuthPhotoPaneProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPausedByUser, setIsPausedByUser] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isTabHidden, setIsTabHidden] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  // Check prefers-reduced-motion
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Listen to tab visibility
  useEffect(() => {
    if (typeof document === "undefined") return;
    const handleVisibility = () => {
      setIsTabHidden(document.hidden);
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  const shouldAutoAdvance =
    !isPausedByUser && !isHovered && !isFocused && !isTabHidden && !prefersReducedMotion;

  const nextSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % slides.length);
  }, []);

  const prevSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + slides.length) % slides.length);
  }, []);

  // Timer: 6 seconds auto-advance
  useEffect(() => {
    if (!shouldAutoAdvance) return;
    const timer = setInterval(() => {
      nextSlide();
    }, 6000);
    return () => clearInterval(timer);
  }, [shouldAutoAdvance, nextSlide]);

  // Keyboard navigation on container (Left / Right arrows)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      nextSlide();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      prevSlide();
    }
  };

  const currentSlide = slides[currentIndex] || slides[0];

  return (
    <aside
      className="auth-hero-pane"
      aria-label="Civic issues handled by GrievanceGrid: potholes, garbage, waterlogging, and open manholes"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setIsFocused(false);
        }
      }}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      style={{ outline: "none" }}
    >
      {/* Background Street Photos with Cross-fade & gentle zoom */}
      <div className="auth-photo-wrapper" aria-hidden="true">
        {slides.map((slide, idx) => {
          const isActive = idx === currentIndex;
          const isPreload =
            idx === (currentIndex + 1) % slides.length ||
            (idx === 0 && currentIndex === slides.length - 1);

          if (!isActive && !isPreload && !prefersReducedMotion) {
            return null;
          }

          return (
            <div
              key={slide.id}
              style={{
                position: "absolute",
                inset: 0,
                opacity: isActive ? 1 : 0,
                transition: prefersReducedMotion ? "none" : "opacity 900ms ease-in-out",
                pointerEvents: "none",
                zIndex: isActive ? 2 : 1,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  height: "100%",
                  transform:
                    isActive && !prefersReducedMotion ? "scale(1.04)" : "scale(1.0)",
                  transition:
                    isActive && !prefersReducedMotion
                      ? "transform 6000ms cubic-bezier(0.25, 1, 0.5, 1)"
                      : "none",
                }}
              >
                <Image
                  src={slide.defaultSrc}
                  alt={slide.alt}
                  fill
                  priority={idx === 0}
                  sizes="(max-width: 767px) 100vw, (max-width: 1023px) 40vw, 45vw"
                  style={{
                    objectFit: "cover",
                    objectPosition: `${slide.focalPoint.x}% ${slide.focalPoint.y}%`,
                  }}
                  placeholder="blur"
                  blurDataURL={slide.blurDataURL}
                />
              </div>
            </div>
          );
        })}

        {/* Soft 12% global dark overlay to prevent high-key flare */}
        <div className="auth-overlay-base" aria-hidden="true" />
        {/* Top gradient scrim for high-contrast Wordmark */}
        <div className="auth-scrim-top" aria-hidden="true" />
        {/* Bottom gradient scrim for high-contrast headline, caption, and support text */}
        <div className="auth-scrim-bottom" aria-hidden="true" />
      </div>

      {/* Top Header: Wordmark */}
      <div className="auth-hero-top">
        <Wordmark size={24} inverted />
      </div>

      {/* Bottom Content: Headline, Support Text, Caption & Slideshow Controls */}
      <div className="auth-hero-bottom">
        <h1 className="auth-hero-title">{headline}</h1>
        <p className="auth-hero-desc">{supportText}</p>

        {/* Current Category Caption */}
        <div
          style={{
            marginTop: "16px",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            backgroundColor: "rgba(15, 23, 42, 0.72)",
            backdropFilter: "blur(4px)",
            padding: "4px 12px",
            borderRadius: "6px",
            border: "1px solid rgba(255, 255, 255, 0.16)",
          }}
        >
          <span
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              backgroundColor: "var(--brand-primary, #38bdf8)",
            }}
          />
          <span
            style={{
              fontSize: "0.8125rem",
              fontWeight: 500,
              color: "#ffffff",
              letterSpacing: "0.01em",
            }}
          >
            {currentSlide.caption}
          </span>
        </div>

        {/* Slideshow progress bars and pause control */}
        <div
          style={{
            marginTop: "16px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
          role="group"
          aria-label="Slideshow controls"
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              flex: 1,
              maxWidth: "200px",
            }}
          >
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setCurrentIndex(i)}
                aria-label={`Show slide ${i + 1}: ${s.caption}`}
                style={{
                  flex: 1,
                  height: "4px",
                  padding: 0,
                  border: "none",
                  borderRadius: "2px",
                  cursor: "pointer",
                  backgroundColor:
                    i === currentIndex ? "#ffffff" : "rgba(255, 255, 255, 0.32)",
                  transition: "background-color 300ms ease",
                }}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => setIsPausedByUser((p) => !p)}
            aria-label={isPausedByUser ? "Resume slideshow auto-play" : "Pause slideshow auto-play"}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "28px",
              height: "28px",
              borderRadius: "50%",
              backgroundColor: "rgba(255, 255, 255, 0.15)",
              border: "1px solid rgba(255, 255, 255, 0.25)",
              color: "#ffffff",
              cursor: "pointer",
              transition: "background-color 150ms ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.3)")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.15)")}
          >
            {isPausedByUser ? <Play size={13} fill="#ffffff" /> : <Pause size={13} fill="#ffffff" />}
          </button>
        </div>
      </div>
    </aside>
  );
}

export default AuthPhotoPane;
