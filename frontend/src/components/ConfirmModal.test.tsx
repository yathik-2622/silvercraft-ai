import { describe, expect, test } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ConfirmModal } from "./ConfirmModal";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("ConfirmModal", () => {
  test("renders the title and message", () => {
    const html = renderToStaticMarkup(
      React.createElement(ConfirmModal, {
        title: "Delete chat?",
        message: "This can't be undone.",
        onConfirm: () => {},
        onCancel: () => {},
      }),
    );
    expect(html).toContain("Delete chat?");
    expect(html).toContain("This can&#x27;t be undone.");
  });

  test("uses the destructive (rose) styling when destructive=true", () => {
    const html = renderToStaticMarkup(
      React.createElement(ConfirmModal, {
        title: "Delete?",
        message: "msg",
        destructive: true,
        onConfirm: () => {},
        onCancel: () => {},
      }),
    );
    expect(html).toContain("bg-rose-600");
  });

  test("defaults to the non-destructive (brand-orange) styling", () => {
    const html = renderToStaticMarkup(
      React.createElement(ConfirmModal, {
        title: "Confirm",
        message: "msg",
        onConfirm: () => {},
        onCancel: () => {},
      }),
    );
    expect(html).not.toContain("bg-rose-600");
    expect(html).toContain("bg-brand-orange");
  });

  test("uses the custom confirmLabel when provided", () => {
    const html = renderToStaticMarkup(
      React.createElement(ConfirmModal, {
        title: "Delete document?",
        message: "msg",
        confirmLabel: "Delete",
        onConfirm: () => {},
        onCancel: () => {},
      }),
    );
    expect(html).toContain(">Delete<");
  });
});

describe("window.confirm removed (Phase 4 regression guard)", () => {
  test("AdminPage.tsx no longer calls window.confirm", () => {
    const src = readFileSync(join(__dirname, "../pages/AdminPage.tsx"), "utf-8");
    expect(src).not.toContain("window.confirm(");
    expect(src).toContain("ConfirmModal");
  });

  test("QuickChatSidebar.tsx no longer calls window.confirm", () => {
    const src = readFileSync(join(__dirname, "./QuickChatSidebar.tsx"), "utf-8");
    expect(src).not.toContain("window.confirm(");
    expect(src).toContain("ConfirmModal");
  });
});
