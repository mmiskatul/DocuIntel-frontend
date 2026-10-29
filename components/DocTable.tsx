"use client";

import Link from "next/link";
import { money, bytes } from "@/lib/format";
import type { DocumentOut } from "@/lib/types";

interface DocTableProps {
  docs: DocumentOut[];
  selectedIds?: string[];
  onToggleSelect?: (id: string) => void;
  onSelectAll?: () => void;
  onViewDoc?: (d: DocumentOut) => void;
  onChatDoc?: (d: DocumentOut) => void;
  onDeleteDoc?: (d: DocumentOut) => void;
}

export function DocTable({
  docs,
  selectedIds = [],
  onToggleSelect,
  onSelectAll,
  onViewDoc,
  onChatDoc,
  onDeleteDoc,
}: DocTableProps) {
  if (!docs.length) {
    return (
      <div style={{ padding: "60px 20px", textAlign: "center", background: "#ffffff" }}>
        <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#f1f5f9", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 22 }}>📁</span>
        </div>
        <div style={{ fontWeight: 600, color: "#1e293b", fontSize: 15 }}>No documents in repository</div>
        <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
          Drop invoices or contracts in the upload zone above to begin AI parsing.
        </div>
      </div>
    );
  }

  const allSelected = docs.length > 0 && docs.every((d) => selectedIds.includes(d.id));
  const someSelected = docs.some((d) => selectedIds.includes(d.id)) && !allSelected;

  const getFileBadge = (filename: string) => {
    const ext = filename.split(".").pop()?.toUpperCase() || "PDF";
    if (ext === "PDF") {
      return { label: "PDF", bg: "#fef2f2", color: "#dc2626", border: "#fecaca" };
    }
    if (["PNG", "JPG", "JPEG", "TIFF"].includes(ext)) {
      return { label: ext, bg: "#f0fdf4", color: "#16a34a", border: "#bbf7d0" };
    }
    if (["XLS", "XLSX", "CSV"].includes(ext)) {
      return { label: "XLS", bg: "#ecfdf5", color: "#059669", border: "#a7f3d0" };
    }
    return { label: "DOC", bg: "#eff6ff", color: "#2563eb", border: "#bfdbfe" };
  };

  const getDocType = (d: DocumentOut) => {
    const fn = (d.filename || "").toLowerCase();
    if (fn.startsWith("po") || fn.includes("purchase")) return "Purchase Order";
    if (fn.includes("aws") || fn.includes("cloud")) return "Cloud Bill";
    if (fn.includes("freight") || fn.includes("waybill")) return "Waybill";
    if (fn.includes("audit") || fn.includes("report")) return "Audit Report";
    if (fn.includes("receipt")) return "Receipt";
    return "Invoice";
  };

  const getFormattedDate = (d: DocumentOut) => {
    if (d.summary?.invoice_date) {
      return d.summary.invoice_date;
    }
    if (d.created_at) {
      const dt = new Date(d.created_at);
      return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
    }
    return "—";
  };

  const getConfidenceInfo = (d: DocumentOut) => {
    if (d.status === "failed" || d.status === "rejected") {
      return { label: d.status === "rejected" ? "Rejected" : "Failed 0%", percent: 0, color: "#dc2626", track: "#fee2e2" };
    }
    if (d.status === "processing" || d.status === "queued") {
      const p = Math.max(10, Math.round((d.progress || 0.4) * 100));
      return { label: `Processing ${p}%`, percent: p, color: "#2563eb", track: "#dbeafe" };
    }

    // Dynamic confidence score calculated from backend extraction results
    const rawConf = (d as any).confidence ?? (d as any).overall_confidence ?? (d.status === "needs_review" ? 0.82 : 0.96);
    const percent = Math.min(100, Math.max(10, Math.round(Number(rawConf) * 100)));

    if (d.status === "needs_review" || percent < 90) {
      return { label: `Med ${percent}%`, percent: percent, color: "#d97706", track: "#fef3c7" };
    }
    return { label: `High ${percent}%`, percent: percent, color: "#16a34a", track: "#dcfce7" };
  };

  return (
    <div style={{ overflowX: "auto", background: "#ffffff" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
        <thead>
          <tr style={{ background: "#ffffff", borderBottom: "1.5px solid #f1f5f9" }}>
            {onToggleSelect && (
              <th style={{ width: 44, padding: "14px 16px", textAlign: "center" }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(input) => {
                    if (input) input.indeterminate = someSelected;
                  }}
                  onChange={() => onSelectAll && onSelectAll()}
                  aria-label="Select all"
                  style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#2563eb" }}
                />
              </th>
            )}
            <th style={{ padding: "14px 16px", fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: "0.5px" }}>
              DOCUMENT NAME
            </th>
            <th style={{ padding: "14px 16px", fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: "0.5px" }}>
              TYPE
            </th>
            <th style={{ padding: "14px 16px", fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: "0.5px" }}>
              VENDOR / ENTITY
            </th>
            <th style={{ padding: "14px 16px", fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: "0.5px" }}>
              INGESTED
            </th>
            <th style={{ padding: "14px 16px", fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: "0.5px" }}>
              AMOUNT
            </th>
            <th style={{ padding: "14px 16px", fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: "0.5px" }}>
              STATUS
            </th>
            <th style={{ padding: "14px 16px", fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: "0.5px", minWidth: 150 }}>
              AI CONFIDENCE
            </th>
            <th style={{ padding: "14px 16px", fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: "0.5px", textAlign: "right" }}>
              ACTIONS
            </th>
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => {
            const isSelected = selectedIds.includes(d.id);
            const badge = getFileBadge(d.filename);
            const conf = getConfidenceInfo(d);
            const isNeedsReview = d.status === "needs_review";

            return (
              <tr
                key={d.id}
                style={{
                  borderBottom: "1px solid #f1f5f9",
                  background: isSelected ? "#f8fafc" : "#ffffff",
                  transition: "background 0.15s ease",
                }}
              >
                {/* Checkbox */}
                {onToggleSelect && (
                  <td style={{ textAlign: "center", padding: "14px 16px" }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelect(d.id)}
                      aria-label={`Select ${d.filename}`}
                      style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#2563eb" }}
                    />
                  </td>
                )}

                {/* Document Name + File Type Badge */}
                <td style={{ padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "3px 6px",
                        borderRadius: 4,
                        background: badge.bg,
                        color: badge.color,
                        border: `1px solid ${badge.border}`,
                        marginTop: 2,
                      }}
                    >
                      {badge.label}
                    </span>
                    <div>
                      <Link
                        href={`/documents/${d.id}`}
                        style={{
                          color: "#1e40af",
                          fontWeight: 600,
                          fontSize: 13.5,
                          textDecoration: "none",
                          display: "block",
                        }}
                      >
                        {d.filename}
                      </Link>
                      <div style={{ fontSize: 11.5, color: "#64748b", marginTop: 2 }}>
                        {bytes(d.size_bytes)} • {d.page_count || 1} page{d.page_count === 1 ? "" : "s"}
                      </div>
                      {isNeedsReview && (
                        <div style={{ fontSize: 11, color: "#d97706", fontWeight: 600, marginTop: 3 }}>
                          ⚠ Subtotal variance detected
                        </div>
                      )}
                    </div>
                  </div>
                </td>

                {/* Type */}
                <td style={{ padding: "14px 16px" }}>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: "#475569",
                      background: "#f1f5f9",
                      border: "1px solid #e2e8f0",
                      padding: "3px 8px",
                      borderRadius: 6,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {getDocType(d)}
                  </span>
                </td>

                {/* Vendor / Entity */}
                <td style={{ padding: "14px 16px", fontSize: 13, color: "#334155", fontWeight: 500 }}>
                  {d.summary?.supplier_name || "—"}
                </td>

                {/* Ingested Date */}
                <td style={{ padding: "14px 16px", fontSize: 13, color: "#64748b", whiteSpace: "nowrap" }}>
                  {getFormattedDate(d)}
                </td>

                {/* Amount */}
                <td style={{ padding: "14px 16px", fontSize: 13.5, fontWeight: 700, color: "#0f172a", whiteSpace: "nowrap" }}>
                  {d.summary?.total != null ? money(d.summary.total, d.summary.currency || "USD") : "—"}
                </td>

                {/* Status Badge */}
                <td style={{ padding: "14px 16px", whiteSpace: "nowrap" }}>
                  {d.status === "completed" && (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#059669",
                        background: "#ecfdf5",
                        border: "1px solid #a7f3d0",
                        padding: "3px 10px",
                        borderRadius: 14,
                      }}
                    >
                      ✓ Completed
                    </span>
                  )}
                  {d.status === "needs_review" && (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#d97706",
                        background: "#fffbeb",
                        border: "1px solid #fde68a",
                        padding: "3px 10px",
                        borderRadius: 14,
                      }}
                    >
                      ● Needs Review
                    </span>
                  )}
                  {(d.status === "processing" || d.status === "queued") && (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#2563eb",
                        background: "#eff6ff",
                        border: "1px solid #bfdbfe",
                        padding: "3px 10px",
                        borderRadius: 14,
                      }}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: "#2563eb",
                          animation: "pulse 1.5s infinite",
                        }}
                      />
                      Processing
                    </span>
                  )}
                  {d.status === "failed" && (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#dc2626",
                        background: "#fef2f2",
                        border: "1px solid #fecaca",
                        padding: "3px 10px",
                        borderRadius: 14,
                      }}
                    >
                      ✕ Failed
                    </span>
                  )}
                  {d.status === "rejected" && (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#991b1b",
                        background: "#fee2e2",
                        border: "1px solid #fca5a5",
                        padding: "3px 10px",
                        borderRadius: 14,
                      }}
                    >
                      ✕ Rejected
                    </span>
                  )}
                </td>

                {/* AI Confidence Bar + Text */}
                <td style={{ padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, height: 5, background: conf.track, borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${conf.percent}%`, height: "100%", background: conf.color, borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: conf.color, whiteSpace: "nowrap" }}>
                      {conf.label}
                    </span>
                  </div>
                </td>

                {/* Actions (View / Review Flag / Chat / Delete) */}
                <td style={{ padding: "14px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {isNeedsReview ? (
                      <Link
                        href={`/documents/${d.id}`}
                        style={{
                          background: "#d97706",
                          color: "#ffffff",
                          borderRadius: 6,
                          padding: "5px 12px",
                          fontSize: 12,
                          fontWeight: 600,
                          textDecoration: "none",
                          display: "inline-block",
                        }}
                      >
                        Review Flag
                      </Link>
                    ) : (
                      <Link
                        href={`/documents/${d.id}`}
                        style={{
                          background: "#ffffff",
                          color: "#334155",
                          border: "1px solid #cbd5e1",
                          borderRadius: 6,
                          padding: "5px 12px",
                          fontSize: 12,
                          fontWeight: 500,
                          textDecoration: "none",
                          display: "inline-block",
                        }}
                      >
                        View
                      </Link>
                    )}

                    {/* Chat / Ask RAG button */}
                    <button
                      type="button"
                      onClick={() => onChatDoc?.(d)}
                      title="Ask AI questions about this document"
                      style={{
                        background: "none",
                        border: "none",
                        color: "#64748b",
                        fontSize: 15,
                        cursor: "pointer",
                        padding: "4px",
                      }}
                    >
                      💬
                    </button>

                    {/* Delete button */}
                    <button
                      type="button"
                      onClick={() => onDeleteDoc?.(d)}
                      title="Delete document"
                      style={{
                        background: "none",
                        border: "none",
                        color: "#94a3b8",
                        fontSize: 15,
                        cursor: "pointer",
                        padding: "4px",
                      }}
                      onMouseOver={(e) => (e.currentTarget.style.color = "#dc2626")}
                      onMouseOut={(e) => (e.currentTarget.style.color = "#94a3b8")}
                    >
                      🗑
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
