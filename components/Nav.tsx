"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileCheck2, FileText, GitCompareArrows, Search } from "lucide-react";
import { useAppSelector } from "@/store";

const LINKS = [
  { href: "/", label: "Documents", icon: FileText, match: (p: string) => p === "/" || p.startsWith("/documents") },
  { href: "/search", label: "Search", icon: Search, match: (p: string) => p.startsWith("/search") },
  { href: "/cross-verify", label: "Cross-verify", icon: GitCompareArrows, match: (p: string) => p.startsWith("/cross-verify") },
];

export function Nav() {
  const path = usePathname();
  const connection = useAppSelector((s) => s.ui.connection);
  const online = connection === "unknown" ? null : connection === "online";

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
