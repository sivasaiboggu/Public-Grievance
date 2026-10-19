"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { Loader2, Search, Check, UserCheck } from "lucide-react";
import {
  transitions,
  type Detail,
  type Status,
} from "@grievancegrid/api-client";
import {
  PLAIN_STATUS_LABELS,
  formatPlural,
} from "../lib/labels";

export interface FieldWorker {
  id: string;
  name: string;
  email: string;
  team_id: string | null;
  team_name: string | null;
  active_tasks_count?: number;
}

const ALL_STATUSES: Status[] = [
  "submitted",
  "under_review",
  "in_progress",
  "resolved",
  "rejected",
];

const DISALLOWED_REASONS: Record<string, string> = {
  "submitted->resolved": "Start work first",
  "submitted->in_progress": "Review it first",
  "under_review->resolved": "Start work first",
  "in_progress->submitted": "Not possible from here",
  "resolved->submitted": "Not possible from here",
  "resolved->under_review": "Not possible from here",
  "rejected->submitted": "Not possible from here",
  "rejected->in_progress": "Not possible from here",
  "rejected->resolved": "Not possible from here",
};

interface OfficerActionControlsProps {
  selected: Detail;
  fieldWorkers: FieldWorker[];
  onAssign: (workerId: string) => Promise<void>;
  onSaveUpdate: (nextStatus: Status, note: string) => Promise<void>;
  isSubmitting?: boolean;
  isAssigning?: boolean;
  idPrefix?: string;
}

export function OfficerActionControls({
  selected,
  fieldWorkers,
  onAssign,
  onSaveUpdate,
  isSubmitting = false,
  isAssigning = false,
  idPrefix = "action",
}: OfficerActionControlsProps) {
  const [nextStatus, setNextStatus] = useState<Status>(selected.status);
  const [officerNote, setOfficerNote] = useState("");
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>(
    selected.assigned_worker_id || ""
  );
  const [isChangingAssignee, setIsChangingAssignee] = useState(
    !selected.assigned_worker_id
  );
  const [workerComboboxOpen, setWorkerComboboxOpen] = useState(false);
  const [workerSearch, setWorkerSearch] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const comboboxRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const triggerBtnRef = useRef<HTMLButtonElement>(null);

  // Sync state when selected report changes
  useEffect(() => {
    setNextStatus(selected.status);
    setOfficerNote("");
    setSelectedWorkerId(selected.assigned_worker_id || "");
    setIsChangingAssignee(!selected.assigned_worker_id);
    setWorkerComboboxOpen(false);
    setWorkerSearch("");
    setHighlightedIndex(0);
  }, [selected.tracking_id, selected.status, selected.assigned_worker_id]);

  // Close combobox on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        comboboxRef.current &&
        !comboboxRef.current.contains(event.target as Node)
      ) {
        setWorkerComboboxOpen(false);
      }
    }
    if (workerComboboxOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [workerComboboxOpen]);

  // Focus search input when combobox opens
  useEffect(() => {
    if (workerComboboxOpen) {
      setHighlightedIndex(0);
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [workerComboboxOpen]);

  const allowedTransitions = transitions[selected.status] || [];

  // Group workers into Matching Team vs Other People
  const matchingWorkers = useMemo(() => {
    const cat = (selected.category || "").toLowerCase();
    return fieldWorkers.filter((w) => {
      const team = (w.team_name || "").toLowerCase();
      if ((cat.includes("road") || cat.includes("pothole")) && team.includes("road")) return true;
      if (cat.includes("garbage") && team.includes("sanitation")) return true;
      if ((cat.includes("drain") || cat.includes("waterlog")) && team.includes("drainage")) return true;
      if (cat.includes("manhole") && (team.includes("drainage") || team.includes("sewerage") || team.includes("water"))) return true;
      return false;
    });
  }, [fieldWorkers, selected.category]);

  const otherWorkers = useMemo(() => {
    return fieldWorkers.filter((w) => !matchingWorkers.some((m) => m.id === w.id));
  }, [fieldWorkers, matchingWorkers]);

  const filteredMatchingWorkers = useMemo(() => {
    if (!workerSearch.trim()) return matchingWorkers;
    const q = workerSearch.toLowerCase().trim();
    return matchingWorkers.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        (w.team_name || "").toLowerCase().includes(q)
    );
  }, [matchingWorkers, workerSearch]);

  const filteredOtherWorkers = useMemo(() => {
    if (!workerSearch.trim()) return otherWorkers;
    const q = workerSearch.toLowerCase().trim();
    return otherWorkers.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        (w.team_name || "").toLowerCase().includes(q)
    );
  }, [otherWorkers, workerSearch]);

  const flattenedList = useMemo(() => {
    return [...filteredMatchingWorkers, ...filteredOtherWorkers];
  }, [filteredMatchingWorkers, filteredOtherWorkers]);

  const selectedWorkerObj = fieldWorkers.find((w) => w.id === selectedWorkerId);
  const currentlyAssignedObj = fieldWorkers.find(
    (w) => w.id === selected.assigned_worker_id
  );

  const hasAssignmentChange =
    selectedWorkerId !== "" && selectedWorkerId !== (selected.assigned_worker_id || "");

  const hasStatusOrNoteChanges =
    nextStatus !== selected.status || officerNote.trim().length > 0;

  const handleKeyDownCombobox = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev < flattenedList.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev > 0 ? prev - 1 : Math.max(0, flattenedList.length - 1)
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (flattenedList.length > 0 && highlightedIndex < flattenedList.length) {
        const chosen = flattenedList[highlightedIndex];
        setSelectedWorkerId(chosen.id);
        setWorkerComboboxOpen(false);
        triggerBtnRef.current?.focus();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setWorkerComboboxOpen(false);
      triggerBtnRef.current?.focus();
    }
  };

  const handleSelectWorker = (workerId: string) => {
    setSelectedWorkerId(workerId);
    setWorkerComboboxOpen(false);
    triggerBtnRef.current?.focus();
  };

  const handlePerformAssign = async () => {
    if (!selectedWorkerId || isAssigning) return;
    await onAssign(selectedWorkerId);
    setIsChangingAssignee(false);
  };

  const handlePerformSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasStatusOrNoteChanges || isSubmitting) return;
    await onSaveUpdate(nextStatus, officerNote);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* 1. Assign to Field Worker */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }} ref={comboboxRef}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <label
            htmlFor={`${idPrefix}-assign-btn`}
            style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-ink)" }}
          >
            Assign to
          </label>
          {selected.assigned_worker_id && !isChangingAssignee && (
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              Active assignment
            </span>
          )}
        </div>

        {selected.assigned_worker_id && !isChangingAssignee ? (
          /* Card showing currently assigned worker with "Change" button */
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 12px",
              backgroundColor: "var(--bg-subtle, #f8fafc)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              gap: "8px",
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "var(--text-ink)",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <UserCheck size={15} color="var(--primary)" />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {selected.assigned_worker_name || currentlyAssignedObj?.name || "Field worker"}
                </span>
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                {selected.assigned_team_name || currentlyAssignedObj?.team_name || "Assigned"}
              </div>
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setIsChangingAssignee(true);
                setWorkerComboboxOpen(true);
              }}
              style={{
                fontSize: "12px",
                padding: "5px 10px",
                flexShrink: 0,
              }}
            >
              Change
            </button>
          </div>
        ) : (
          /* Combobox selector for assigning or changing */
          <div style={{ position: "relative" }}>
            <button
              ref={triggerBtnRef}
              id={`${idPrefix}-assign-btn`}
              type="button"
              aria-haspopup="listbox"
              aria-expanded={workerComboboxOpen}
              onClick={() => setWorkerComboboxOpen(!workerComboboxOpen)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
                  e.preventDefault();
                  setWorkerComboboxOpen(true);
                }
              }}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border)",
                backgroundColor: "var(--bg-surface)",
                textAlign: "left",
                fontSize: "13px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                cursor: "pointer",
                color: selectedWorkerObj ? "var(--text-ink)" : "var(--text-muted)",
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {selectedWorkerObj ? selectedWorkerObj.name : "Choose a person"}
              </span>
              <span style={{ fontSize: "10px", color: "var(--text-muted)", marginLeft: "8px" }}>▼</span>
            </button>

            {/* Dropdown popup */}
            {workerComboboxOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  left: 0,
                  right: 0,
                  maxHeight: "280px",
                  overflowY: "auto",
                  backgroundColor: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.14)",
                  zIndex: 60,
                  padding: "6px",
                  boxSizing: "border-box",
                }}
                onKeyDown={handleKeyDownCombobox}
              >
                {/* Search field */}
                <div style={{ position: "relative", marginBottom: "6px" }}>
                  <Search
                    size={14}
                    style={{
                      position: "absolute",
                      left: 8,
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--text-muted)",
                    }}
                  />
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Search active field workers..."
                    value={workerSearch}
                    onChange={(e) => {
                      setWorkerSearch(e.target.value);
                      setHighlightedIndex(0);
                    }}
                    style={{
                      width: "100%",
                      padding: "6px 8px 6px 28px",
                      fontSize: "12px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border)",
                      boxSizing: "border-box",
                      backgroundColor: "var(--bg-subtle, #f8fafc)",
                    }}
                  />
                </div>

                {/* Group 1: Matching team */}
                {filteredMatchingWorkers.length > 0 && (
                  <div style={{ marginBottom: "6px" }}>
                    <div
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        color: "var(--text-muted)",
                        padding: "4px 8px",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      Matching team
                    </div>
                    {filteredMatchingWorkers.map((w) => {
                      const overallIndex = flattenedList.findIndex((item) => item.id === w.id);
                      const isHighlighted = overallIndex === highlightedIndex;
                      const isSelected = selectedWorkerId === w.id;

                      return (
                        <div
                          key={w.id}
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => handleSelectWorker(w.id)}
                          onMouseEnter={() => setHighlightedIndex(overallIndex)}
                          style={{
                            padding: "6px 8px",
                            fontSize: "13px",
                            borderRadius: "var(--radius-sm)",
                            cursor: "pointer",
                            backgroundColor: isSelected
                              ? "var(--primary-subtle, rgba(29, 78, 216, 0.1))"
                              : isHighlighted
                              ? "var(--bg-subtle, #f1f5f9)"
                              : "transparent",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontWeight: 500, color: "var(--text-ink)" }}>
                              {w.name}
                            </div>
                            <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                              {w.team_name || "General"}
                            </div>
                          </div>
                          <span
                            style={{
                              fontSize: "11px",
                              color: "var(--text-muted)",
                              flexShrink: 0,
                              marginLeft: "8px",
                            }}
                          >
                            {formatPlural(w.active_tasks_count || 0, "job")}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Group 2: Other people */}
                {filteredOtherWorkers.length > 0 && (
                  <div>
                    <div
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        color: "var(--text-muted)",
                        padding: "4px 8px",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      Other people
                    </div>
                    {filteredOtherWorkers.map((w) => {
                      const overallIndex = flattenedList.findIndex((item) => item.id === w.id);
                      const isHighlighted = overallIndex === highlightedIndex;
                      const isSelected = selectedWorkerId === w.id;

                      return (
                        <div
                          key={w.id}
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => handleSelectWorker(w.id)}
                          onMouseEnter={() => setHighlightedIndex(overallIndex)}
                          style={{
                            padding: "6px 8px",
                            fontSize: "13px",
                            borderRadius: "var(--radius-sm)",
                            cursor: "pointer",
                            backgroundColor: isSelected
                              ? "var(--primary-subtle, rgba(29, 78, 216, 0.1))"
                              : isHighlighted
                              ? "var(--bg-subtle, #f1f5f9)"
                              : "transparent",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontWeight: 500, color: "var(--text-ink)" }}>
                              {w.name}
                            </div>
                            <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                              {w.team_name || "General"}
                            </div>
                          </div>
                          <span
                            style={{
                              fontSize: "11px",
                              color: "var(--text-muted)",
                              flexShrink: 0,
                              marginLeft: "8px",
                            }}
                          >
                            {formatPlural(w.active_tasks_count || 0, "job")}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {flattenedList.length === 0 && (
                  <div
                    style={{
                      padding: "16px 8px",
                      textAlign: "center",
                      fontSize: "12px",
                      color: "var(--text-muted)",
                    }}
                  >
                    No field workers found.
                  </div>
                )}
              </div>
            )}

            {/* Action buttons when a person is chosen */}
            <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
              {hasAssignmentChange && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handlePerformAssign}
                  disabled={isAssigning}
                  style={{
                    padding: "6px 14px",
                    fontSize: "12px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  {isAssigning ? (
                    <>
                      <Loader2 size={13} className="spin" />
                      <span>Assigning...</span>
                    </>
                  ) : (
                    <span>Assign</span>
                  )}
                </button>
              )}

              {selected.assigned_worker_id && isChangingAssignee && (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    setIsChangingAssignee(false);
                    setSelectedWorkerId(selected.assigned_worker_id || "");
                    setWorkerComboboxOpen(false);
                  }}
                  style={{ fontSize: "12px", padding: "6px 10px" }}
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div style={{ height: "1px", backgroundColor: "var(--border-subtle)" }} />

      {/* 2. Status Select (lists every status; unavailable ones show plain reason) */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <label
          htmlFor={`${idPrefix}-status-select`}
          style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-ink)" }}
        >
          Status
        </label>
        <select
          id={`${idPrefix}-status-select`}
          value={nextStatus}
          onChange={(e) => setNextStatus(e.target.value as Status)}
          style={{
            width: "100%",
            padding: "8px 12px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border)",
            backgroundColor: "var(--bg-surface)",
            fontSize: "13px",
            color: "var(--text-ink)",
          }}
        >
          {ALL_STATUSES.map((st) => {
            const isCurrent = selected.status === st;
            const isAllowed = isCurrent || allowedTransitions.includes(st);
            const reasonKey = `${selected.status}->${st}`;
            const disallowedReason = DISALLOWED_REASONS[reasonKey] || "Not possible from here";

            return (
              <option key={st} value={st} disabled={!isAllowed}>
                {PLAIN_STATUS_LABELS[st] || st}
                {!isAllowed ? ` (${disallowedReason})` : isCurrent ? " (Current)" : ""}
              </option>
            );
          })}
        </select>
      </div>

      {/* 3. Note for resident */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <label
            htmlFor={`${idPrefix}-officer-note`}
            style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-ink)" }}
          >
            Note for the resident
          </label>
          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
            {officerNote.length}/500
          </span>
        </div>
        <textarea
          id={`${idPrefix}-officer-note`}
          rows={3}
          placeholder="Tell the resident what you found or did."
          value={officerNote}
          maxLength={500}
          onChange={(e) => setOfficerNote(e.target.value)}
          style={{
            width: "100%",
            padding: "8px 10px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border)",
            fontSize: "13px",
            boxSizing: "border-box",
            resize: "vertical",
          }}
        />
        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
          The resident will see this.
        </span>
      </div>

      {/* 4. Save update primary button */}
      <button
        type="button"
        className="btn-primary"
        onClick={handlePerformSave}
        disabled={!hasStatusOrNoteChanges || isSubmitting}
        style={{
          width: "100%",
          justifyContent: "center",
          padding: "10px",
          fontSize: "13px",
        }}
      >
        {isSubmitting ? (
          <>
            <Loader2 size={15} className="spin" />
            <span>Saving update...</span>
          </>
        ) : (
          <span>Save update</span>
        )}
      </button>
    </div>
  );
}
