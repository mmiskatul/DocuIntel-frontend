"use client";

import Link from "next/link";
import { money } from "@/lib/format";
import type { DocumentOut } from "@/lib/types";

interface DocTableProps {
  docs: DocumentOut[];
  selectedIds?: string[];
  onToggleSelect?: (id: string) => void;
  onSelectAll?: () => void;
  extra?: (d: DocumentOut) => React.ReactNode;
}

export function DocTable({
  docs,
  selectedIds = [],
  onToggleSelect,
  onSelectAll,
  extra,
}: DocTableProps) {
  if (!docs.length) {
    return <div className="empty" style={{ padding: "40px 20px" }}>No documents found matching the selected criteria.</div>;
  }

  const allSelected = docs.length > 0 && docs.every((d) => selectedIds.includes(d.id));
  const someSelected = docs.some((d) => selectedIds.includes(d.id)) && !allSelected;

  const getDocType = (d: DocumentOut) => {
    if (d.filename.toUpperCase().startsWith("PO")) return "Purchase Order";
    if (d.filename.toLowerCase().includes("statement")) return "Bank Statement";
    if (d.filename.toLowerCase().includes("ledger")) return "Ledger";
    if (d.filename.toLowerCase().includes("receipt")) return "Receipt";
    return "Invoice";
  };

  const getFormattedDate = (d: DocumentOut) => {
    if (d.summary.invoice_date) {
      const parts = d.summary.invoice_date.split("-");
      if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
      return d.summary.invoice_date;
    }
    const dt = new Date(d.created_at);
    return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
  };

  const getConfidenceLevel = (d: DocumentOut): { label: "High" | "Medium" | "Low"; bg: string; color: string } => {
    if (d.status === "failed") return { label: "Low", bg: "#fce8e6", color: "#c4261d" };
    if (d.status === "needs_review") return { label: "Medium", bg: "#fef9c3", color: "#854d0e" };
    if (d.status === "processing") return { label: "Medium", bg: "#fef9c3", color: "#854d0e" };
    return { label: "High", bg: "#dcfce7", color: "#15803d" };
  };

  const getStatusBadge = (d: DocumentOut) => {
    switch (d.status) {
      case "processing":
      case "queued":
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "#eff6ff",
              color: "#1d4ed8",
              border: "1px solid #bfdbfe",
              padding: "3px 10px",
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                border: "2px solid #3b82f6",
                borderTopColor: "transparent",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
              }}
            />
            Processing
          </span>
        );
      case "completed":
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              background: "#f0fdf4",
              color: "#16a34a",
              border: "1px solid #bbf7d0",
              padding: "3px 10px",
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Completed
          </span>
        );
      case "needs_review":
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              background: "#fef9c3",
              color: "#a16207",
              border: "1px solid #fde047",
              padding: "3px 10px",
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            Needs Review
          </span>
        );
      case "failed":
      default:
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              background: "#dc2626",
              color: "#ffffff",
              padding: "3px 12px",
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            Error
          </span>
        );
    }
  };

  return (
    <div className="table-wrap">
      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#fafbfc", borderBottom: "1px solid #e2e8f0" }}>
            {onToggleSelect && (
              <th style={{ width: 40, padding: "12px 14px", textAlign: "center" }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(input) => {
                    if (input) input.indeterminate = someSelected;
                  }}
                  onChange={() => onSelectAll && onSelectAll()}
                  aria-label="Select all documents"
                  style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#0b63b8" }}
                />
              </th>
            )}
            <th style={{ padding: "12px 14px", color: "#64748b", fontWeight: 600, fontSize: 12 }}>Document</th>
            <th style={{ padding: "12px 14px", color: "#64748b", fontWeight: 600, fontSize: 12 }}>Type</th>
            <th style={{ padding: "12px 14px", color: "#64748b", fontWeight: 600, fontSize: 12 }}>Vendor</th>
            <th style={{ padding: "12px 14px", color: "#64748b", fontWeight: 600, fontSize: 12 }}>Date</th>
            <th style={{ padding: "12px 14px", color: "#64748b", fontWeight: 600, fontSize: 12 }}>Amount</th>
            <th style={{ padding: "12px 14px", color: "#64748b", fontWeight: 600, fontSize: 12 }}>Status</th>
            <th style={{ padding: "12px 14px", color: "#64748b", fontWeight: 600, fontSize: 12 }}>Confidence</th>
            {extra && <th style={{ width: 80 }} />}
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => {
            const isSelected = selectedIds.includes(d.id);
            const conf = getConfidenceLevel(d);
            return (
              <tr
                key={d.id}
                style={{
                  background: isSelected ? "#eef6ff" : "transparent",
                  borderBottom: "1px solid #f1f5f9",
                  transition: "background 0.15s ease",
                }}
              >
                {onToggleSelect && (
                  <td style={{ textAlign: "center", padding: "12px 14px" }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelect(d.id)}
                      aria-label={`Select ${d.filename}`}
                      style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#0b63b8" }}
                    />
                  </td>
                )}
                <td style={{ padding: "12px 14px" }}>
                  <Link
                    href={`/documents/${d.id}`}
                    style={{
                      color: "#1e293b",
                      fontWeight: 600,
                      textDecoration: "none",
                      display: "block",
                      lineHeight: 1.3,
                    }}
                  >
                    {d.filename}
                  </Link>
                  {d.error && d.status === "failed" && (
                    <div style={{ color: "#b91c1c", fontSize: 11, marginTop: 3, maxWidth: 300 }}>
                      {d.error.slice(0, 90)}...
                    </div>
                  )}
                </td>
                <td style={{ padding: "12px 14px", color: "#475569", fontSize: 13 }}>
                  {getDocType(d)}
                </td>
                <td style={{ padding: "12px 14px", color: "#1e293b", fontWeight: 500, fontSize: 13 }}>
                  {d.summary.supplier_name || "—"}
                </td>
                <td style={{ padding: "12px 14px", color: "#64748b", fontSize: 13 }}>
                  {getFormattedDate(d)}
                </td>
                <td style={{ padding: "12px 14px", color: "#0f172a", fontWeight: 600, fontSize: 13 }}>
                  {money(d.summary.total, d.summary.currency || (d.filename.includes("0417") ? "USD" : "EUR"))}
                </td>
                <td style={{ padding: "12px 14px" }}>
                  {getStatusBadge(d)}
                </td>
                <td style={{ padding: "12px 14px" }}>
                  <span
                    style={{
                      background: conf.bg,
                      color: conf.color,
                      padding: "2px 10px",
                      borderRadius: 12,
                      fontSize: 11.5,
                      fontWeight: 600,
                      display: "inline-block",
                    }}
                  >
                    {conf.label}
                  </span>
                </td>
                {extra && (
                  <td style={{ padding: "12px 14px", textAlign: "right" }}>
                    {extra(d)}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}