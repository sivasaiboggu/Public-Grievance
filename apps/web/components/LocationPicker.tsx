"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { MapPin, Navigation, Search, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import type L from "leaflet";

interface LocationPickerProps {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  locationSource: "manual" | "device";
  landmark: string;
  onLocationChange: (lat: number, lng: number, source: "manual" | "device", acc?: number | null) => void;
  onLandmarkChange: (text: string) => void;
}

// Default viewport center when no coordinates have been chosen yet (Bengaluru municipal area)
const DEFAULT_VIEWPORT_CENTER: [number, number] = [12.9716, 77.5946];

export function LocationPicker({
  latitude,
  longitude,
  accuracy,
  locationSource,
  landmark,
  onLocationChange,
  onLandmarkChange,
}: LocationPickerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const watchTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [locating, setLocating] = useState(false);
  const [locateStatus, setLocateStatus] = useState<string>("");
  const [locateError, setLocateError] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState(landmark);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [showManualCoords, setShowManualCoords] = useState(false);
  const [manualLat, setManualLat] = useState(latitude ? String(latitude) : "");
  const [manualLng, setManualLng] = useState(longitude ? String(longitude) : "");

  // Clear GPS watch on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (watchTimerRef.current) {
        clearTimeout(watchTimerRef.current);
      }
    };
  }, []);

  // Initialize Leaflet Map
  useEffect(() => {
    let isMounted = true;

    async function initMap() {
      if (!mapContainerRef.current || mapRef.current) return;
      const leaflet = await import("leaflet");

      if (!isMounted || !mapContainerRef.current) return;

      const initialCenter: [number, number] =
        latitude && longitude ? [latitude, longitude] : DEFAULT_VIEWPORT_CENTER;
      const initialZoom = latitude && longitude ? 16 : 12;

      const map = leaflet.map(mapContainerRef.current, {
        center: initialCenter,
        zoom: initialZoom,
        zoomControl: true,
      });

      leaflet
        .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
          maxZoom: 19,
        })
        .addTo(map);

      // Custom SVG Pin Icon
      const pinSvg = `
        <svg width="32" height="42" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 0C7.16344 0 0 7.16344 0 16C0 27.5 16 42 16 42C16 42 32 27.5 32 16C32 7.16344 24.8366 0 16 0Z" fill="#1D4ED8"/>
          <circle cx="16" cy="16" r="6" fill="#FFFFFF"/>
        </svg>
      `;
      const customIcon = leaflet.divIcon({
        className: "custom-leaflet-pin",
        html: pinSvg,
        iconSize: [32, 42],
        iconAnchor: [16, 42],
      });

      // If coordinates already present, place marker
      if (latitude && longitude) {
        const marker = leaflet
          .marker([latitude, longitude], { icon: customIcon, draggable: true })
          .addTo(map);

        marker.on("dragend", () => {
          const pos = marker.getLatLng();
          onLocationChange(pos.lat, pos.lng, "manual", null);
        });

        markerRef.current = marker;

        if (accuracy && accuracy <= 500) {
          const circle = leaflet
            .circle([latitude, longitude], {
              radius: accuracy,
              color: "#1D4ED8",
              fillColor: "#1D4ED8",
              fillOpacity: 0.12,
              weight: 1.5,
            })
            .addTo(map);
          circleRef.current = circle;
        }
      }

      // Allow tapping anywhere on map to position pin
      map.on("click", (e: L.LeafletMouseEvent) => {
        const { lat, lng } = e.latlng;
        if (markerRef.current) {
          markerRef.current.setLatLng([lat, lng]);
        } else {
          const marker = leaflet
            .marker([lat, lng], { icon: customIcon, draggable: true })
            .addTo(map);
          marker.on("dragend", () => {
            const pos = marker.getLatLng();
            onLocationChange(pos.lat, pos.lng, "manual", null);
          });
          markerRef.current = marker;
        }

        if (circleRef.current) {
          map.removeLayer(circleRef.current);
          circleRef.current = null;
        }

        onLocationChange(lat, lng, "manual", null);
      });

      mapRef.current = map;
    }

    initMap();

    return () => {
      isMounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []); // Run once on mount

  // Sync external coordinate updates to map marker
  useEffect(() => {
    if (!mapRef.current || latitude === null || longitude === null) return;

    import("leaflet").then((leaflet) => {
      if (!mapRef.current) return;

      const pos: [number, number] = [latitude, longitude];

      if (!markerRef.current) {
        const pinSvg = `
          <svg width="32" height="42" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M16 0C7.16344 0 0 7.16344 0 16C0 27.5 16 42 16 42C16 42 32 27.5 32 16C32 7.16344 24.8366 0 16 0Z" fill="#1D4ED8"/>
            <circle cx="16" cy="16" r="6" fill="#FFFFFF"/>
          </svg>
        `;
        const customIcon = leaflet.divIcon({
          className: "custom-leaflet-pin",
          html: pinSvg,
          iconSize: [32, 42],
          iconAnchor: [16, 42],
        });

        const marker = leaflet.marker(pos, { icon: customIcon, draggable: true }).addTo(mapRef.current);
        marker.on("dragend", () => {
          const p = marker.getLatLng();
          onLocationChange(p.lat, p.lng, "manual", null);
        });
        markerRef.current = marker;
      } else {
        markerRef.current.setLatLng(pos);
      }

      // Accuracy circle
      if (accuracy && accuracy <= 500) {
        if (!circleRef.current) {
          circleRef.current = leaflet
            .circle(pos, {
              radius: accuracy,
              color: "#1D4ED8",
              fillColor: "#1D4ED8",
              fillOpacity: 0.12,
              weight: 1.5,
            })
            .addTo(mapRef.current);
        } else {
          circleRef.current.setLatLng(pos);
          circleRef.current.setRadius(accuracy);
        }
      } else if (circleRef.current) {
        mapRef.current.removeLayer(circleRef.current);
        circleRef.current = null;
      }

      mapRef.current.setView(pos, Math.max(mapRef.current.getZoom(), 16));
    });
  }, [latitude, longitude, accuracy]);

  // Reverse Geocode using Nominatim (single request on demand)
  const reverseGeocode = useCallback(
    async (lat: number, lng: number) => {
      try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
        const res = await fetch(url, {
          headers: {
            "User-Agent": "GrievanceGrid-Public-Service/1.0",
            Accept: "application/json",
          },
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.display_name) {
            // Pick a clean, short street address from the reverse geocode result
            const road = data.address?.road || data.address?.suburb || data.address?.neighbourhood || "";
            const area = data.address?.city_district || data.address?.city || "";
            const cleanText = [road, area].filter(Boolean).join(", ") || data.display_name.split(",").slice(0, 3).join(", ");
            if (cleanText) {
              onLandmarkChange(cleanText);
              setSearchQuery(cleanText);
            }
          }
        }
      } catch {
        // Reverse lookup failure degrades gracefully: user can type landmark
      }
    },
    [onLandmarkChange]
  );

  // Live Location Watch (high accuracy, refined until accuracy <= 30m or 10s)
  const handleUseCurrentLocation = () => {
    setLocateError("");
    setLocateStatus("Finding you…");
    setLocating(true);

    if (!navigator.geolocation) {
      setLocateError("Your browser does not support location. Please pick your place on the map below.");
      setLocating(false);
      return;
    }

    if (window.location.protocol !== "https:" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
      setLocateError("Location requires a secure connection (HTTPS or localhost). Please select your position on the map or enter coordinates.");
      setLocating(false);
      return;
    }

    let bestAcc = Infinity;
    let latestPos: GeolocationPosition | null = null;

    const stopWatching = () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (watchTimerRef.current) {
        clearTimeout(watchTimerRef.current);
        watchTimerRef.current = null;
      }
      setLocating(false);
    };

    // 10 second timeout safety
    watchTimerRef.current = setTimeout(() => {
      if (latestPos) {
        const acc = Math.round(latestPos.coords.accuracy);
        if (acc > 100) {
          setLocateStatus(`Location found (±${acc} m). For better accuracy, adjust the pin on the map or step outside.`);
        } else {
          setLocateStatus(`Location found, accurate to about ${acc} m.`);
        }
      } else {
        setLocateError("Could not detect your position in time. Please tap on the map or enter an address.");
      }
      stopWatching();
    }, 10000);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const acc = Math.round(position.coords.accuracy);
        latestPos = position;

        if (acc < bestAcc) {
          bestAcc = acc;
        }

        onLocationChange(lat, lng, "device", acc);
        reverseGeocode(lat, lng);

        if (acc <= 30) {
          setLocateStatus(`Location found, accurate to about ${acc} m.`);
          stopWatching();
        } else {
          setLocateStatus(`Finding you… ±${acc} m`);
        }
      },
      (error) => {
        stopWatching();
        if (error.code === error.PERMISSION_DENIED) {
          setLocateError("Location permission was denied. You can tap on the map to set your location, or search for a street.");
        } else if (error.code === error.TIMEOUT) {
          setLocateError("Location request timed out. Please tap the map or search for a street.");
        } else {
          setLocateError("Could not retrieve your location. Please tap the map or search for a street.");
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  // Search Address via Nominatim (1 request per user click, no autocomplete)
  const handleAddressSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    setSearchError("");

    try {
      const q = encodeURIComponent(searchQuery.trim());
      const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=jsonv2&limit=1`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "GrievanceGrid-Public-Service/1.0",
          Accept: "application/json",
        },
      });

      if (!res.ok) throw new Error("Search service temporarily unavailable");

      const data = await res.json();
      if (!data || data.length === 0) {
        setSearchError("No matching places found. Try another landmark or street name.");
        return;
      }

      const match = data[0];
      const lat = parseFloat(match.lat);
      const lng = parseFloat(match.lon);

      onLocationChange(lat, lng, "manual", null);
      onLandmarkChange(searchQuery.trim());
      setLocateStatus("Location updated from address search.");
    } catch {
      setSearchError("Could not search this address. Please try again or tap on the map.");
    } finally {
      setSearching(false);
    }
  };

  const handleManualCoordsApply = (e: React.FormEvent) => {
    e.preventDefault();
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);

    if (isNaN(lat) || lat < -90 || lat > 90) {
      setSearchError("Latitude must be between -90 and 90.");
      return;
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
      setSearchError("Longitude must be between -180 and 180.");
      return;
    }

    setSearchError("");
    onLocationChange(lat, lng, "manual", null);
    reverseGeocode(lat, lng);
  };

  const hasChosenLocation = latitude !== null && longitude !== null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      {/* Primary Action Button */}
      <div>
        <button
          type="button"
          onClick={handleUseCurrentLocation}
          disabled={locating}
          className="btn btn-primary"
          style={{ width: "100%", gap: "8px" }}
        >
          <Navigation size={18} className={locating ? "spin" : ""} />
          <span>{locating ? "Finding your position…" : "Use my current location"}</span>
        </button>

        {/* Live GPS Status */}
        {locateStatus && (
          <p
            style={{
              fontSize: "0.8125rem",
              color: "var(--text-ink)",
              marginTop: "8px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: "var(--success)",
                display: "inline-block",
              }}
            />
            <span>{locateStatus}</span>
          </p>
        )}

        {/* Location Error Guidance */}
        {locateError && (
          <div role="alert" className="banner banner-error" style={{ marginTop: "10px" }}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "2px" }} />
            <span>{locateError}</span>
          </div>
        )}
      </div>

      {/* Address / Landmark Search Field */}
      <form onSubmit={handleAddressSearch} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <label htmlFor="landmark-input">Landmark or street (optional but helpful)</label>
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            id="landmark-input"
            type="text"
            placeholder="e.g. Near 4th Block Bus Stop, 14th Main Rd"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              onLandmarkChange(e.target.value);
            }}
            maxLength={240}
          />
          <button
            type="submit"
            className="btn btn-secondary"
            disabled={searching || !searchQuery.trim()}
            style={{ flexShrink: 0 }}
          >
            <Search size={16} />
            <span>{searching ? "Searching…" : "Search address"}</span>
          </button>
        </div>
        {searchError && <span className="field-error">{searchError}</span>}
      </form>

      {/* Draggable Map with Accuracy Circle */}
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: "6px",
          }}
        >
          <span style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-ink)" }}>
            Map (drag pin or tap to adjust position)
          </span>
          {hasChosenLocation && (
            <span className="text-muted" style={{ fontSize: "0.75rem" }}>
              Pin placed ({locationSource === "device" ? "from device" : "placed on map"})
            </span>
          )}
        </div>

        <div
          ref={mapContainerRef}
          style={{
            height: "260px",
            width: "100%",
            borderRadius: "var(--radius-sm)",
            border: `1px solid ${hasChosenLocation ? "var(--border)" : "var(--border)"}`,
            backgroundColor: "var(--bg-subtle)",
            overflow: "hidden",
            position: "relative",
            zIndex: 1,
          }}
        />

        {!hasChosenLocation && (
          <p className="text-muted" style={{ fontSize: "0.75rem", marginTop: "6px" }}>
            Tip: Tap on the map above or click &ldquo;Use my current location&rdquo; to set where the problem is.
          </p>
        )}
      </div>

      {/* Manual Coordinates Disclosure (Default Closed) */}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: "12px" }}>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setShowManualCoords((prev) => !prev)}
          style={{
            fontSize: "0.8125rem",
            color: "var(--text-muted)",
            padding: "4px 0",
            minHeight: "32px",
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <span>Enter coordinates manually</span>
          {showManualCoords ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {showManualCoords && (
          <form
            onSubmit={handleManualCoordsApply}
            style={{
              marginTop: "10px",
              padding: "12px",
              background: "var(--bg-subtle)",
              borderRadius: "var(--radius-sm)",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            <p className="text-muted" style={{ fontSize: "0.75rem", margin: 0 }}>
              Use this only if the map doesn&apos;t work for you.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div>
                <label htmlFor="manual-lat" style={{ fontSize: "0.75rem" }}>
                  Latitude
                </label>
                <input
                  id="manual-lat"
                  type="number"
                  step="0.000001"
                  placeholder="e.g. 12.9716"
                  value={manualLat}
                  onChange={(e) => setManualLat(e.target.value)}
                  style={{ minHeight: "40px", fontSize: "0.8125rem" }}
                />
              </div>
              <div>
                <label htmlFor="manual-lng" style={{ fontSize: "0.75rem" }}>
                  Longitude
                </label>
                <input
                  id="manual-lng"
                  type="number"
                  step="0.000001"
                  placeholder="e.g. 77.5946"
                  value={manualLng}
                  onChange={(e) => setManualLng(e.target.value)}
                  style={{ minHeight: "40px", fontSize: "0.8125rem" }}
                />
              </div>
            </div>
            <button
              type="submit"
              className="btn btn-secondary"
              style={{ alignSelf: "flex-start", minHeight: "36px", fontSize: "0.8125rem" }}
            >
              Apply coordinates
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
