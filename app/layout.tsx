import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { StoreProvider } from "@/components/StoreProvider";

export const metadata: Metadata = {
  title: "DocuIntel — Document Intelligence",
  description: "Upload invoices, extract structured data, validate and search.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <StoreProvider>
          <Nav />
          <main className="container">{children}</main>
        </StoreProvider>
      </body>
    </html>
  );
}
