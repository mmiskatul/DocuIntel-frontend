"use client";

import { useRef, useState } from "react";
import { CheckCircle2, UploadCloud, X } from "lucide-react";
import { api } from "@/lib/api";
import { bytes } from "@/lib/format";

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
  const [queuedCount, setQueuedCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const add = (list: FileList | File[]) => {
    setError(null);
    setQueuedCount(null);
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
      await api.upload(valid);
      setQueuedCount(valid.length);
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
      <div
        className={`drop${over ? " over" : ""}`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.current?.click(); } }}
        aria-label="Choose files to upload"
      >
        <span className="drop-icon"><UploadCloud size={20} /></span>
        <div>
          <strong>Drop files here, or click to choose</strong>
          <span className="muted small">PDF, images, Excel or CSV · up to {MAX_MB} MB each · several files at once</span>
        </div>
        <input ref={input} type="file" multiple hidden accept={ACCEPT.join(",")}
          onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = ""; }} />
      </div>

      {files.length > 0 && (
        <>
          <ul className="queue">
            {files.map((f, i) => (
              <li key={`${f.name}:${f.size}`}>
                <span className="truncate">
                  <strong>{f.name}</strong> <span className="muted mono small">{bytes(f.size)}</span>
                  {problems[i] && <span className="bad"> — {problems[i]}</span>}
                </span>
                <button type="button" className="btn-icon" aria-label={`Remove ${f.name}`} onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}>
                  <X size={15} />
                </button>
              </li>
            ))}
          </ul>
          <div className="row" style={{ marginTop: 12 }}>
            <button type="button" className="btn btn-primary" disabled={busy || !valid.length} onClick={send}>
              {busy ? "Uploading…" : `Process ${valid.length} file${valid.length === 1 ? "" : "s"}`}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => setFiles([])}>Clear</button>
          </div>
        </>
      )}

      {error && <div className="alert alert-error" role="alert" style={{ marginTop: 12 }}><div>{error}</div></div>}

      {queuedCount !== null && (
        <div className="alert alert-ok" role="status" style={{ marginTop: 12 }}>
          <CheckCircle2 size={16} />
          <div><strong>{queuedCount} file{queuedCount === 1 ? "" : "s"} queued.</strong> They appear in the table below and update as each page is read.</div>
          <button type="button" className="btn-icon" aria-label="Dismiss" onClick={() => setQueuedCount(null)}><X size={15} /></button>
        </div>
      )}
    </div>
  );
}
