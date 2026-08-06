import { describe, expect, test, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CreateProjectCanvas } from "./CreateProjectCanvas";

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ user: { username: "qa_user" } }),
}));

describe("CreateProjectCanvas — Database Connection section (Phase 5)", () => {
  test("renders an 'Add a database connection' entry point, collapsed by default", () => {
    const html = renderToStaticMarkup(
      React.createElement(CreateProjectCanvas, { onCancel: () => {}, onCreated: () => {} }),
    );
    expect(html).toContain("Database Connection (optional)");
    expect(html).toContain("Add a database connection");
    // Collapsed by default — the dialect <select> shouldn't be in the initial render.
    expect(html).not.toContain("postgresql</option>");
  });

  test("no longer mentions per-message DB selection — copy reflects the create-time-only move", () => {
    const html = renderToStaticMarkup(
      React.createElement(CreateProjectCanvas, { onCancel: () => {}, onCreated: () => {} }),
    );
    expect(html).toContain("no longer be changed from inside a chat");
  });
});

describe("ChatWorkspace.tsx no longer imports DbConnectionPicker (Phase 5 regression guard)", () => {
  test("composer has no DbConnectionPicker usage", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(__dirname, "./ChatWorkspace.tsx"), "utf-8");
    expect(src).not.toContain("DbConnectionPicker");
  });
});
