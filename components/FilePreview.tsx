"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Download, FileSpreadsheet, Loader2, ShieldCheck } from "lucide-react";

const PREVIEWABLE = /^(application\/pdf|image\/)/;

/**
 * Shows one page of the original document as an image drawn by the backend, so the preview works in every
 * browser (it does not need the browser's PDF viewer or any iframe). Spreadsheets, CSV and text cannot be drawn:
 * they get a download link, and their content is available in the "Page text" views.
 */
export default function FilePreview({ imageUrl, fileUrl, fileType, filename, page, zoom, original = "available" }: {
  imageUrl: string; fileUrl: string; fileType: string; filename: string; page: number; zoom: number;
  /** "removed": deleted from storage after approval. "missing": never kept. */
  original?: "available" | "removed" | "missing";
}) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => setState("loading"), [imageUrl]);

  const download = (
    <a href={fileUrl} download={filename} className="btn btn-sm"><Download size={14} /> Download original</a>
  );

  if (original !== "available") {
    return (
      <div className="canvas-empty" style={{ background: "var(--surface)", minHeight: "100%" }}>
        <ShieldCheck size={36} />
        <strong style={{ color: "var(--ink)" }}>{original === "removed" ? "The original file was deleted after approval" : "The original file is not stored"}</strong>
        <span>
          {original === "removed"
            ? "Originals are kept only while a document waits for review. The extracted values and the text that was read are kept."
            : "Only the extracted values and the text that was read are available."}
        </span>
        <span>Open “Page text” or “All text” to see what was read.</span>
      </div>
    );
  }

  if (!PREVIEWABLE.test(fileType || "")) {
    return (
      <div className="canvas-empty" style={{ background: "var(--surface)", minHeight: "100%" }}>
        <FileSpreadsheet size={36} />
        <strong style={{ color: "var(--ink)" }}>No page preview for this file type</strong>
        <span>Spreadsheets and text files cannot be drawn as a page. Open “Page text” to see what was read.</span>
        {download}
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="canvas-empty">
        <AlertTriangle size={32} />
        <strong style={{ color: "var(--ink)" }}>This page could not be drawn</strong>
        <span>The file may be damaged. You can still read the text or download the original.</span>
        {download}
      </div>
    );
  }

  return (
    <div style={{ position: "relative", padding: 16, display: "flex", justifyContent: zoom > 100 ? "flex-start" : "center", minHeight: 240 }}>
      {state === "loading" && (
        <div className="canvas-empty" style={{ position: "absolute", inset: 0 }}>
          <Loader2 size={24} className="spin" /> Loading page {page}…
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={imageUrl}
        src={imageUrl}
        alt={`${filename}, page ${page}`}
        onLoad={() => setState("ready")}
        onError={() => setState("error")}
        style={{
          width: `${zoom}%`, maxWidth: zoom > 100 ? "none" : 900, height: "auto", background: "#fff",
          boxShadow: "0 1px 6px rgba(21, 34, 43, 0.25)", visibility: state === "ready" ? "visible" : "hidden",
        }}
      />
    </div>
  );
}
