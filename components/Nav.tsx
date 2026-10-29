"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export function Nav() {
  const path = usePathname();
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);

  useEffect(() => {
    // Check unified FastAPI backend status on mount & keep awake
    const checkStatus = () => {
      api.stats()
        .then(() => setApiOnline(true))
        .catch(() => setApiOnline(false));
    };

    checkStatus();
    const interval = setInterval(checkStatus, 45000);
    return () => clearInterval(interval);
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
            AI OCR &amp; RAG
          </span>
        </Link>

        <nav className="nav">
          {link("/", "📄 Documents", path === "/" || path.startsWith("/documents"))}
          {link("/search", "🔍 AI Search", path.startsWith("/search"))}
        </nav>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            title={apiOnline === true ? "FastAPI & Supabase backend is connected" : "Connecting to backend..."}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "12px",
              fontWeight: 500,
              padding: "4px 11px",
              borderRadius: "20px",
              background: apiOnline === true ? "#ecfdf5" : apiOnline === false ? "#fffbeb" : "#f1f5f9",
              color: apiOnline === true ? "#059669" : apiOnline === false ? "#b45309" : "#64748b",
              border: `1px solid ${apiOnline === true ? "#a7f3d0" : apiOnline === false ? "#fde68a" : "#e2e8f0"}`,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: apiOnline === true ? "#10b981" : apiOnline === false ? "#f59e0b" : "#94a3b8",
              }}
            />
            {apiOnline === true ? "API Connected" : apiOnline === false ? "Connecting..." : "Checking..."}
          </div>
        </div>
      </div>
    </header>
  );
}
