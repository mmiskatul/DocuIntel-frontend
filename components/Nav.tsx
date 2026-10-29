"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export function Nav() {
  const path = usePathname();
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);

  useEffect(() => {
    // Check backend health on mount
    api.stats()
      .then(() => setApiOnline(true))
      .catch(() => setApiOnline(false));
  }, []);

  const link = (href: string, label: string, active: boolean) => (
    <Link href={href} className={active ? "active" : ""}>
      {label}
    </Link>
  );

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/" className="brand" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "8px" }}>
          <span>Docu<span>Intel</span></span>
          <span style={{
            fontSize: "10.5px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            padding: "2px 7px",
            borderRadius: "4px",
            background: "var(--primary-soft)",
            color: "var(--primary)"
          }}>
            AI OCR
          </span>
        </Link>

        <nav className="nav">
          {link("/", "📄 Documents", path === "/" || (path.startsWith("/documents") && !path.startsWith("/reconcile")))}
          {link("/reconcile", "⚖️ Reconciliation", path.startsWith("/reconcile"))}
          {link("/search", "🔍 AI Search", path.startsWith("/search"))}
        </nav>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            title={apiOnline === true ? "Connected to live NestJS & AI OCR backend" : apiOnline === false ? "Connecting to backend..." : "Checking backend status..."}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "12px",
              fontWeight: 500,
              padding: "4px 10px",
              borderRadius: "20px",
              background: apiOnline === true ? "#ecfdf5" : "#f1f5f9",
              color: apiOnline === true ? "#059669" : "#64748b",
              border: `1px solid ${apiOnline === true ? "#a7f3d0" : "#e2e8f0"}`,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: apiOnline === true ? "#10b981" : "#94a3b8",
              }}
            />
            {apiOnline === true ? "API Connected" : apiOnline === false ? "Connecting..." : "Checking..."}
          </div>
        </div>
      </div>
    </header>
  );
}
