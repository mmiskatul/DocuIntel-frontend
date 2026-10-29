"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { bytes } from "@/lib/format";
import type { UploadItem } from "@/lib/types";

export const ACCEPT = [".pdf", ".jpg", ".jpeg", ".png", ".tif", ".tiff", ".xlsx", ".xls", ".csv", ".doc", ".docx"];
export const MAX_MB = 100;

export function validateFile(f: File): string | null {
  const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
  if (!ACCEPT.includes(ext)) return `Unsupported file type (${ext || "none"})`;
  if (f.size === 0) return "File is empty";
  if (f.size > MAX_MB * 1024 * 1024) return `Larger than ${MAX_MB} MB`;
  return null;
}

export function UploadZone({ onUploaded }: { onUploaded: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadSuccessCount, setUploadSuccessCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const add = (list: FileList | File[]) => {
    setError(null);
    const incoming = Array.from(list);
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}`));
      return [...prev, ...incoming.filter((f) => !seen.has(`${f.name}:${f.size}`))];
    });
  };

  const problems = files.map(validateFile);
  const valid = files.filter((_, i) => !problems[i]);

  async function send() {
    if (!valid.length) return;
    setBusy(true);
    setError(null);
    try {
      const out = await api.upload(valid);
      setUploadSuccessCount(valid.length);
      setFiles([]);
      onUploaded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {/* Dashed Dropzone */}
      <div
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          add(e.dataTransfer.files);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") input.current?.click();
        }}
        aria-label="Choose files to upload"
        style={{
          border: over ? "2px dashed #2563eb" : "2px dashed #93c5fd",
          backgroundColor: over ? "#eff6ff" : "#f8fafc",
          borderRadius: 10,
          padding: "36px 20px 28px",
          textAlign: "center",
          cursor: "pointer",
          transition: "all 0.15s ease",
        }}
      >
        {/* Cloud Upload Icon */}
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            backgroundColor: "#e0f2fe",
            color: "#0284c7",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 14,
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
            <path d="M12 12v9" />
            <path d="m16 16-4-4-4 4" />
          </svg>
        </div>

        <div style={{ fontSize: 15, color: "#1e293b", fontWeight: 600, marginBottom: 4 }}>
          Drop invoices here or <span style={{ color: "#2563eb", textDecoration: "underline" }}>click to browse</span>
        </div>

        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>
          PDF, JPG, PNG, TIFF, XLSX, CSV • up to 100 MB each • multiple files batch queue supported
        </div>

        {/* Feature Pills */}
        <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: "#475569",
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              padding: "3px 10px",
              borderRadius: 14,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            ⚡ OCR Parser v2.4
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: "#475569",
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              padding: "3px 10px",
              borderRadius: 14,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            🔍 Auto RAG Embeddings
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: "#475569",
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              padding: "3px 10px",
              borderRadius: 14,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            📊 Multi-Page Table Extraction
          </span>
        </div>

        <input
          ref={input}
          type="file"
          multiple
          hidden
          accept={ACCEPT.join(",")}
          onChange={(e) => {
            if (e.target.files) add(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {/* Selected Pending Files */}
      {files.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
            {files.map((f, i) => (
              <li
                key={`${f.name}:${f.size}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 12px",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: 6,
                  fontSize: 13,
                }}
              >
                <span>
                  <strong>{f.name}</strong> <span style={{ color: "#64748b" }}>· {bytes(f.size)}</span>
                  {problems[i] && (
                    <span style={{ color: "#dc2626", marginLeft: 8, fontSize: 11, fontWeight: 600 }}>
                      ⚠ {problems[i]}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}
                  style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 12 }}
                >
                  ✕ Remove
                </button>
              </li>
            ))}
          </ul>

          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12 }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy || !valid.length}
              onClick={send}
              style={{ padding: "6px 16px" }}
            >
              {busy ? "Uploading & Starting OCR..." : `Start Processing ${valid.length} File${valid.length === 1 ? "" : "s"}`}
            </button>
            <button
              type="button"
              className="btn btn-sm"
              disabled={busy}
              onClick={() => setFiles([])}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <div style={{ marginTop: 14, padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#991b1b", fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Upload Success Banner (Matches Image alert) */}
      {uploadSuccessCount !== null && (
        <div
          style={{
            marginTop: 14,
            padding: "10px 16px",
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: 8,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 13,
            color: "#166534",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#16a34a" }} />
            <span>
              <strong>{uploadSuccessCount} file(s) queued for processing</strong> — progress appears below. LangChain OCR &amp; extraction pipeline running in background.
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 80, height: 6, backgroundColor: "#bbf7d0", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ width: "100%", height: "100%", backgroundColor: "#16a34a", borderRadius: 3 }} />
            </div>
            <button
              type="button"
              onClick={() => setUploadSuccessCount(null)}
              style={{ background: "none", border: "none", color: "#166534", fontSize: 12, cursor: "pointer", fontWeight: 600 }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
