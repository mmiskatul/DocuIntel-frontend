"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { FileCheck2, FileText, GitCompareArrows, Search } from "lucide-react";
import { api } from "@/lib/api";

const LINKS = [
  { href: "/", label: "Documents", icon: FileText, match: (p: string) => p === "/" || p.startsWith("/documents") },
  { href: "/search", label: "Search", icon: Search, match: (p: string) => p.startsWith("/search") },
  { href: "/cross-verify", label: "Cross-verify", icon: GitCompareArrows, match: (p: string) => p.startsWith("/cross-verify") },
];

export function Nav() {
  const path = usePathname();
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    const check = () => api.stats().then(() => setOnline(true)).catch(() => setOnline(false));
    void check();
    const id = setInterval(check, 45000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/" className="brand" aria-label="DocuIntel home">
          <span className="brand-mark"><FileCheck2 size={15} strokeWidth={2.4} /></span>
          DocuIntel
        </Link>
        <nav className="nav" aria-label="Main">
          {LINKS.map(({ href, label, icon: Icon, match }) => (
            <Link key={href} href={href} aria-current={match(path) ? "page" : undefined}>
              <Icon size={16} /> <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="spacer" />
        <div className="conn" role="status" title={online ? "The processing backend is reachable" : online === false ? "The backend is not reachable" : "Checking the backend"}>
          <i className={`dot ${online ? "ok" : online === false ? "warn" : "live"}`} />
          <span>{online ? "Backend connected" : online === false ? "Backend unreachable" : "Checking backend"}</span>
        </div>
      </div>
    </header>
  );
}
