import { describe, expect, test, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectChatSidebar } from "./ProjectChatSidebar";
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

describe("ProjectChatSidebar (project chat's own scoped chat-history sidebar)", () => {
  test("renders a New Chat button, not a Home link", () => {
    mockChats = [];
    const html = renderToStaticMarkup(React.createElement(ProjectChatSidebar));
    expect(html).toContain("New Chat");
    expect(html).not.toContain(">Home<");
  });

  test("shows an empty-state message scoped to this project when there are no chats yet", () => {
    mockChats = [];
    const html = renderToStaticMarkup(React.createElement(ProjectChatSidebar));
    expect(html).toContain("No chats yet in this project");
  });

  test("renders only the chats provided by the (already project-scoped) workspace context", () => {
    mockChats = [
      { chat_id: "chat_1", project_id: "proj_1", user_id: "u1", title: "Model the orders table", title_is_default: false, orchestrator_model: null, messages: [], created_at: "2026-01-01T00:00:00Z" },
      { chat_id: "chat_2", project_id: "proj_1", user_id: "u1", title: "Discuss keys", title_is_default: false, orchestrator_model: null, messages: [], created_at: "2026-01-01T00:00:00Z" },
    ];
    mockActiveChatId = "chat_1";
    const html = renderToStaticMarkup(React.createElement(ProjectChatSidebar));
    expect(html).toContain("Model the orders table");
    expect(html).toContain("Discuss keys");
    expect(html).not.toContain("No chats yet");
  });

  test("renders without crashing when localStorage is unavailable (this test environment)", () => {
    expect(typeof localStorage).toBe("undefined");
    mockChats = [];
    const html = renderToStaticMarkup(React.createElement(ProjectChatSidebar));
    expect(html).toContain("New Chat");
  });
});
