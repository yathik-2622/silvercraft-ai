import { describe, expect, test, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DashboardHeader } from "./DashboardHeader";

let mockUser: { username: string; is_admin: boolean } = { username: "qa_user", is_admin: false };

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ user: mockUser, logout: () => {} }),
}));

const noop = () => {};
const baseProps = {
  activeView: "dashboard" as const,
  onSelectDashboard: noop,
  onSelectSkills: noop,
  onSelectAdmin: noop,
  onSelectSettings: noop,
};

describe("DashboardHeader (Phase 4 — replaces the global sidebar)", () => {
  test("shows the Skills icon but hides the Upload icon for a non-admin user", () => {
    mockUser = { username: "qa_user", is_admin: false };
    const html = renderToStaticMarkup(React.createElement(DashboardHeader, baseProps));
    expect(html).toContain("Skill Repository");
    expect(html).not.toContain("Upload — Knowledge Base");
  });

  test("shows both the Upload and Skills icons for an admin user", () => {
    mockUser = { username: "qa_admin", is_admin: true };
    const html = renderToStaticMarkup(React.createElement(DashboardHeader, baseProps));
    expect(html).toContain("Skill Repository");
    expect(html).toContain("Upload — Knowledge Base");
  });

  test("renders the brand mark", () => {
    mockUser = { username: "qa_user", is_admin: false };
    const html = renderToStaticMarkup(React.createElement(DashboardHeader, baseProps));
    expect(html).toContain("Assisted Data Modelling");
  });
});
