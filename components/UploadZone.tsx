"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { bytes } from "@/lib/format";
import type { UploadItem } from "@/lib/types";

export const ACCEPT = [".pdf", ".jpg", ".jpeg", ".png", ".tif", ".tiff", ".xlsx", ".xls", ".csv"];
export const MAX_MB = 50;

export function validateFile(f: File): string | null {
  const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
  if (!ACCEPT.includes(ext)) return `Unsupported type (${ext || "none"})`;
  if (f.size === 0) return "File is empty";
  if (f.size > MAX_MB * 1024 * 1024) return `Larger than ${MAX_MB} MB`;
  return null;
}

export function UploadZone({ onUploaded }: { onUploaded: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<UploadItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const add = (list: FileList | File[]) => {
    setResult(null);
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
      setResult(out);
      setFiles([]);
      onUploaded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div
        className={`dropzone ${over ? "over" : ""}`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
        role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") input.current?.click(); }}
        aria-label="Choose files to upload"
      >
        <strong>Drop invoices here or click to browse</strong>
        <span className="muted">PDF, JPG, PNG, TIFF, XLSX, XLS, CSV · up to {MAX_MB} MB each · multiple files supported</span>
        <input ref={input} type="file" multiple hidden accept={ACCEPT.join(",")}
          onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = ""; }} />
      </div>

      {files.length > 0 && (
        <>
          <ul className="file-list">
            {files.map((f, i) => (
              <li key={`${f.name}:${f.size}`}>
                <span>
                  {f.name} <span className="muted small">· {bytes(f.size)}</span>
                  {problems[i] && <span className="badge b-error" style={{ marginLeft: 8 }}>{problems[i]}</span>}
                </span>
                <button className="btn-link" onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}>Remove</button>
              </li>
            ))}
          </ul>
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn btn-primary" disabled={busy || !valid.length} onClick={send}>
              {busy ? "Uploading…" : `Upload ${valid.length} file${valid.length === 1 ? "" : "s"}`}
            </button>
            <button className="btn" disabled={busy} onClick={() => setFiles([])}>Clear</button>
            {valid.length < files.length && <span className="muted small">Invalid files will be skipped.</span>}
          </div>
        </>
      )}

      {error && <div className="alert alert-error" style={{ marginTop: 14 }}>{error}</div>}
      {result && (
        <div style={{ marginTop: 14 }}>
          <div className="alert alert-ok">
            {result.filter((r) => r.status === "queued").length} file(s) queued for processing — progress appears below.
          </div>
          {result.filter((r) => r.status === "rejected").map((r) => (
            <div key={r.filename} className="alert alert-error">{r.filename}: {r.error}</div>
          ))}
          {result.filter((r) => r.duplicate_of).map((r) => (
            <div key={`d${r.id}`} className="alert alert-warn">{r.filename} is identical to a file that was already uploaded.</div>
          ))}
        </div>
      )}
    </div>
  );
}
