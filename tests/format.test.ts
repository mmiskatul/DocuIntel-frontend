import { describe, expect, it } from "vitest";
import { bytes, confidenceLevel, diffFields, duration, fileKind, issuesByField, money, parseField, shortDate } from "../lib/format";
import type { InvoiceData, Issue } from "../lib/types";

const inv = (o: Partial<InvoiceData> = {}): InvoiceData => ({
  invoice_number: "A1", invoice_date: "2025-01-02", supplier_name: "S", customer_name: "C",
  subtotal: 100, tax: 15, total: 115, currency: "USD", line_items: [], ...o,
} as InvoiceData);

describe("format", () => {
  it("money", () => {
    expect(money(1234.5, "USD")).toBe("USD 1,234.50");
    expect(money(null)).toBe("—");
    expect(money(0)).toBe("0.00");
  });
  it("bytes", () => {
    expect(bytes(10)).toBe("10 B");
    expect(bytes(2048)).toBe("2.0 KB");
    expect(bytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
  it("duration", () => {
    expect(duration(null)).toBe("—");
    expect(duration(250)).toBe("250 ms");
    expect(duration(2500)).toBe("2.5 s");
    expect(duration(125_000)).toBe("2 m 5 s");
  });
  it("confidenceLevel", () => {
    expect(confidenceLevel(0.9, true)).toBe("high");
    expect(confidenceLevel(0.7, true)).toBe("medium");
    expect(confidenceLevel(0.3, true)).toBe("low");
    expect(confidenceLevel(0.9, false)).toBe("none");
    expect(confidenceLevel(undefined, true)).toBe("medium");
  });
  it("issuesByField skips info and groups", () => {
    const mk = (id: number, field: string | null, severity: Issue["severity"]) => ({ id, field, severity, message: "m", code: "c", resolved: false }) as Issue;
    const g = issuesByField([mk(1, "total", "error"), mk(2, "total", "warning"), mk(3, null, "error"), mk(4, "tax", "info")]);
    expect(g.total).toHaveLength(2);
    expect(g._general).toHaveLength(1);
    expect(g.tax).toBeUndefined();
  });
  it("parseField", () => {
    expect(parseField("total", "1,234.50")).toBe(1234.5);
    expect(parseField("total", "abc")).toBeUndefined();
    expect(parseField("total", " ")).toBeNull();
    expect(parseField("currency", "usd")).toBe("USD");
    expect(parseField("supplier_name", " Acme ")).toBe("Acme");
  });
  it("diffFields returns only changed fields", () => {
    expect(diffFields(inv(), inv())).toEqual({});
    expect(diffFields(inv(), inv({ total: 120 }))).toEqual({ total: 120 });
    const items = [{ description: "x", quantity: 1, unit_price: 1, amount: 1 }];
    expect(diffFields(inv(), inv({ line_items: items }))).toEqual({ line_items: items });
  });
  it("fileKind tells PDFs, images and spreadsheets apart by type or extension", () => {
    expect(fileKind("application/pdf", "a.pdf")).toEqual({ kind: "pdf", label: "PDF" });
    expect(fileKind("", "scan.PNG")).toEqual({ kind: "image", label: "PNG" });
    expect(fileKind("text/csv", "ledger.csv")).toEqual({ kind: "sheet", label: "CSV" });
    expect(fileKind("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "b.xlsx")).toEqual({ kind: "sheet", label: "XLS" });
    expect(fileKind(null, "notes.docx").kind).toBe("other");
  });
  it("shortDate formats an ISO date and survives bad input", () => {
    expect(shortDate(null)).toBe("—");
    expect(shortDate("not a date")).toBe("not a date");
    expect(shortDate("2026-05-02T10:00:00Z")).toMatch(/2026/);
  });
});
