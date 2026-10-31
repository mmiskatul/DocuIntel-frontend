"use client";

import { useEffect, useState } from "react";

const PREVIEWABLE = /^(application\/pdf|image\/)/;

const center: React.CSSProperties = {
  minHeight: 320, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
  gap: 10, color: "#475569", fontSize: 14, padding: 24, textAlign: "center",
};

/**
 * Shows one page of the original document as an image drawn by the backend, so the preview works in every
 * browser (it does not need the browser's PDF viewer or any iframe). Spreadsheets/CSV/text cannot be drawn:
 * they get a download link, and their content is available in the "Extracted Text" tabs.
 */
export default function FilePreview({ imageUrl, fileUrl, fileType, filename, page, zoom }: {
  imageUrl: string; fileUrl: string; fileType: string; filename: string; page: number; zoom: number;
}) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => setState("loading"), [imageUrl]);

  const download = (
    <a href={fileUrl} download={filename} style={{ color: "#2563eb", fontWeight: 600 }}>Download {filename}</a>
  );

  if (!PREVIEWABLE.test(fileType || "")) {
    return (
      <div style={center}>
        <div style={{ fontSize: 34 }}>📄</div>
        <div>A browser cannot preview this file type ({fileType || "unknown"}).</div>
        <div>Use the “Extracted Text” tabs to see what was read, or download the original.</div>
        {download}
      </div>
    );
  }

  return (
    <div style={{ padding: 16, display: "flex", justifyContent: zoom > 100 ? "flex-start" : "center" }}>
      {state === "loading" && <div style={{ ...center, position: "absolute", inset: 0 }}>Loading page {page}…</div>}
      {state === "error" ? (
        <div style={center}>
          <div>This page could not be drawn. The file may be damaged.</div>
          {download}
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={imageUrl}
          src={imageUrl}
          alt={`${filename} - page ${page}`}
          onLoad={() => setState("ready")}
          onError={() => setState("error")}
          style={{
            width: `${zoom}%`, maxWidth: zoom > 100 ? "none" : 900, height: "auto", background: "#fff",
            boxShadow: "0 1px 6px rgba(15, 23, 42, 0.25)", visibility: state === "ready" ? "visible" : "hidden",
          }}
        />
      )}
    </div>
  );
}
