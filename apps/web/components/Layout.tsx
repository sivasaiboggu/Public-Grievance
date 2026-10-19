import React from "react";

interface ContainerProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Reading container for forms, stepper, report detail. Max 720px.
 */
export function ReadingContainer({ children, className = "", style }: ContainerProps) {
  return (
    <div
      className={`container-reading ${className}`}
      style={{
        width: "100%",
        maxWidth: "720px",
        marginLeft: "auto",
        marginRight: "auto",
        minWidth: 0,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Standard page container for all signed-in pages: max-width 1280px, padding 24px (16px on mobile).
 * Shares exact left and right edge across top bar, page header, and content.
 */
export function PageContainer({ children, className = "", style }: ContainerProps) {
  return (
    <div
      className={`page-container ${className}`}
      style={{
        width: "100%",
        maxWidth: "1280px",
        marginLeft: "auto",
        marginRight: "auto",
        paddingLeft: "24px",
        paddingRight: "24px",
        minWidth: 0,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Workspace container for queue, senior dashboard, admin view. Max 1280px.
 */
export function WorkspaceContainer({ children, className = "", style }: ContainerProps) {
  return (
    <div
      className={`container-workspace page-container ${className}`}
      style={{
        width: "100%",
        maxWidth: "1280px",
        marginLeft: "auto",
        marginRight: "auto",
        paddingLeft: "24px",
        paddingRight: "24px",
        minWidth: 0,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * Single unified PageHeader used across every page in the application.
 * Shares the exact same left-edge and typographic scale.
 */
export function PageHeader({ title, description, action, style }: PageHeaderProps) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: "16px",
        marginBottom: "24px",
        flexWrap: "wrap",
        ...style,
      }}
    >
      <div style={{ flex: 1, minWidth: "240px" }}>
        <h1
          style={{
            fontSize: "1.75rem",
            fontWeight: 600,
            lineHeight: 1.25,
            letterSpacing: "-0.02em",
            color: "var(--text-ink)",
            margin: 0,
          }}
        >
          {title}
        </h1>
        {description && (
          <p
            className="text-muted"
            style={{
              fontSize: "0.875rem",
              marginTop: "4px",
              lineHeight: 1.5,
              margin: "4px 0 0 0",
            }}
          >
            {description}
          </p>
        )}
      </div>
      {action && (
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "8px" }}>
          {action}
        </div>
      )}
    </div>
  );
}

interface SectionProps {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

/**
 * Single unified Section component.
 */
export function Section({ title, description, action, children, style, className = "" }: SectionProps) {
  return (
    <section className={`app-section ${className}`} style={{ marginBottom: "24px", ...style }}>
      {(title || action) && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: "12px",
            gap: "12px",
          }}
        >
          <div>
            {title && (
              <h2
                style={{
                  fontSize: "1.125rem",
                  fontWeight: 600,
                  margin: 0,
                  color: "var(--text-ink)",
                }}
              >
                {title}
              </h2>
            )}
            {description && (
              <p
                className="text-muted"
                style={{ fontSize: "0.8125rem", marginTop: "2px", margin: "2px 0 0 0" }}
              >
                {description}
              </p>
            )}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
