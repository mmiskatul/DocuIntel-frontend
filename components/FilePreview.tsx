"use client";

import { useEffect, useState } from "react";

const PREVIEWABLE = /^(application\/pdf|image\/(png|jpe?g|gif|webp|bmp))/;

const center: React.CSSProperties = {
  height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
  gap: 10, color: "#475569", fontSize: 14, padding: 24, textAlign: "center",
};

/**
 * Shows the original file. The file is fetched by the page itself and displayed from a local blob URL, so the
 * preview does not depend on how the server frames/serves the file (no X-Frame-Options / CSP surprises).
 * Only PDFs and images can be previewed by a browser; every other type gets a download link.
 */
export default function FilePreview({ url, fileType, filename, page, zoom }: {
  url: string; fileType: string; filename: string; page: number; zoom: number;
}) {
  const canPreview = PREVIEWABLE.test(fileType || "");
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canPreview) return;
    let revoked: string | null = null;
    let cancelled = false;
    setBlobUrl(null);
    setError(null);
    fetch(url, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`The server answered ${r.status}`);
        const blob = await r.blob();
        if (!blob.size) throw new Error("The stored file is empty");
        // keep the server's content type so the browser picks the right viewer
        const typed = blob.type ? blob : new Blob([blob], { type: fileType });
        revoked = URL.createObjectURL(typed);
        if (!cancelled) setBlobUrl(revoked);
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "Could not load the file"));
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [url, fileType, canPreview]);

  const download = (
    <a href={url} download={filename} style={{ color: "#2563eb", fontWeight: 600 }}>Download {filename}</a>
  );

  if (!canPreview) {
    return (
      <div style={center}>
        <div>A browser cannot preview this file type ({fileType || "unknown"}).</div>
        <div>Use the “Extracted Text” tabs to see what was read, or download the original.</div>
        {download}
      </div>
    );
  }
  if (error) {
    return (
      <div style={center}>
        <div>The preview could not be loaded: {error}.</div>
        {download}
      </div>
    );
  }
  if (!blobUrl) return <div style={center}>Loading preview…</div>;

  const scale: React.CSSProperties = { transform: `scale(${zoom / 100})`, transformOrigin: "top left" };
  if (fileType.startsWith("image/")) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={blobUrl} alt={filename} style={{ maxWidth: "100%", ...scale }} />;
  }
  return (
    <iframe
      key={blobUrl}
      src={`${blobUrl}#page=${page}`}
      title={`${filename} - page ${page}`}
      style={{ width: "100%", height: "100%", border: "none", ...scale }}
    />
  );
}
