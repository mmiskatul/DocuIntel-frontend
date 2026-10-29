"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api, getStoredToken } from "@/lib/api";

export function Nav() {
  const path = usePathname();
  const [user, setUser] = useState<{ id: string; email: string; name?: string; role?: string } | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = getStoredToken();
    if (token) {
      api.getMe()
        .then((res) => {
          if (res?.authenticated && res.user) {
            setUser(res.user);
          }
        })
        .catch(() => {
          api.logout();
          setUser(null);
        });
    }
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (isRegister) {
        const res = await api.register(email, password, name);
        setUser(res.user);
      } else {
        const res = await api.login(email, password);
        setUser(res.user);
      }
      setShowModal(false);
    } catch (err: any) {
      setError(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const demoEmail = "demo@docuintel.com";
      const demoPass = "Demo1234!";
      try {
        const res = await api.login(demoEmail, demoPass);
        setUser(res.user);
      } catch {
        const res = await api.register(demoEmail, demoPass, "Demo User");
        setUser(res.user);
      }
      setShowModal(false);
    } catch (err: any) {
      setError(err.message || "Failed to generate demo JWT");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    api.logout();
    setUser(null);
  };

  const link = (href: string, label: string, active: boolean) => (
    <Link href={href} className={active ? "active" : ""}>
      {label}
    </Link>
  );

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="brand" style={{ textDecoration: "none" }}>
            Docu<span>Intel</span>
          </Link>
          <nav className="nav">
            {link("/", "Documents", path === "/" || (path.startsWith("/documents") && !path.startsWith("/reconcile")))}
            {link("/reconcile", "Reconciliation", path.startsWith("/reconcile"))}
            {link("/search", "Search", path.startsWith("/search"))}
          </nav>

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "10px" }}>
            {user ? (
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span className="small muted" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--green)" }} />
                  {user.name || user.email}
                  <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "var(--primary-soft)", color: "var(--primary)", fontWeight: 600 }}>
                    JWT
                  </span>
                </span>
                <button onClick={handleLogout} className="btn btn-sm">
                  Sign Out
                </button>
              </div>
            ) : (
              <button onClick={() => setShowModal(true)} className="btn btn-sm btn-primary">
                Sign In (JWT)
              </button>
            )}
          </div>
        </div>
      </header>

      {showModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            className="card"
            style={{ width: "100%", maxWidth: 380, margin: 0, boxShadow: "0 10px 25px rgba(0,0,0,0.2)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card-head" style={{ padding: "0 0 12px 0", borderBottom: "1px solid var(--border)" }}>
              <strong style={{ fontSize: 16 }}>{isRegister ? "Create Account" : "Sign In to DocuIntel"}</strong>
              <button onClick={() => setShowModal(false)} className="btn-link" style={{ fontSize: 18 }}>
                &times;
              </button>
            </div>

            {error && (
              <div style={{ padding: "8px 12px", background: "var(--red-soft)", color: "var(--red)", borderRadius: 6, margin: "12px 0", fontSize: 13 }}>
                {error}
              </div>
            )}

            <form onSubmit={handleAuth} style={{ display: "grid", gap: 12, marginTop: 14 }}>
              {isRegister && (
                <div>
                  <label className="field">Full Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jane Doe"
                  />
                </div>
              )}

              <div>
                <label className="field">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                />
              </div>

              <div>
                <label className="field">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>

              <button type="submit" className="btn btn-primary" disabled={loading} style={{ marginTop: 4 }}>
                {loading ? "Processing..." : isRegister ? "Register & Generate JWT" : "Sign In with JWT"}
              </button>
            </form>

            <div style={{ margin: "14px 0", display: "flex", alignItems: "center", gap: 8 }}>
              <hr style={{ flex: 1, border: "none", borderTop: "1px solid var(--border)" }} />
              <span className="small muted">OR</span>
              <hr style={{ flex: 1, border: "none", borderTop: "1px solid var(--border)" }} />
            </div>

            <button
              type="button"
              onClick={handleDemoLogin}
              disabled={loading}
              className="btn btn-sm"
              style={{ width: "100%", textAlign: "center", background: "var(--primary-soft)", color: "var(--primary)", borderColor: "transparent" }}
            >
              1-Click Demo JWT Login
            </button>

            <div style={{ marginTop: 14, textAlign: "center" }} className="small muted">
              {isRegister ? "Already have an account? " : "Need an account? "}
              <button
                type="button"
                onClick={() => {
                  setIsRegister(!isRegister);
                  setError("");
                }}
                className="btn-link"
              >
                {isRegister ? "Sign In" : "Register"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
