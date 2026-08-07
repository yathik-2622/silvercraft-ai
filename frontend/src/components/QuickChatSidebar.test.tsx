import { describe, expect, test, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QuickChatSidebar } from "./QuickChatSidebar";
import type { Chat } from "../types";

let mockChats: Chat[] = [];
let mockActiveChatId: string | null = null;

vi.mock("../workspace/WorkspaceContext", () => ({
  useWorkspace: () => ({
    chats: mockChats,
    activeChatId: mockActiveChatId,
    selectChat: () => {},
    renameChat: () => {},
    deleteChat: () => {},
  }),
}));

describe("QuickChatSidebar (Phase 4 — standalone Quick Chat page's own sidebar)", () => {
  test("renders a Home link and a Create Chat button", () => {
    mockChats = [];
    const html = renderToStaticMarkup(React.createElement(QuickChatSidebar, { onHome: () => {} }));
    expect(html).toContain("Home");
    expect(html).toContain("Create Chat");
  });

  test("shows an empty-state message when there are no chats yet", () => {
    mockChats = [];
    const html = renderToStaticMarkup(React.createElement(QuickChatSidebar, { onHome: () => {} }));
    expect(html).toContain("No chats yet");
  });

  test("renders each chat's title from real chat history", () => {
    mockChats = [
      { chat_id: "chat_1", project_id: null, user_id: "u1", title: "First quick chat", title_is_default: false, orchestrator_model: null, messages: [], created_at: "2026-01-01T00:00:00Z" },
      { chat_id: "chat_2", project_id: null, user_id: "u1", title: "Second quick chat", title_is_default: false, orchestrator_model: null, messages: [], created_at: "2026-01-01T00:00:00Z" },
    ];
    mockActiveChatId = "chat_1";
    const html = renderToStaticMarkup(React.createElement(QuickChatSidebar, { onHome: () => {} }));
    expect(html).toContain("First quick chat");
    expect(html).toContain("Second quick chat");
    expect(html).not.toContain("No chats yet");
  });

  test("renders without crashing when localStorage is unavailable (this test environment)", () => {
    // Sanity guard for the collapse-state read/write — a missing/blocked
    // localStorage (also true of private-browsing Safari) must not crash
    // the sidebar, just fall back to the expanded default.
    expect(typeof localStorage).toBe("undefined");
    mockChats = [];
    const html = renderToStaticMarkup(React.createElement(QuickChatSidebar, { onHome: () => {} }));
    expect(html).toContain("Create Chat");
  });
});
