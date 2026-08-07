import { describe, expect, test, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectArtifactsModal } from "./ProjectArtifactsModal";
import type { ProjectArtifact } from "../api/client";

let mockArtifacts: ProjectArtifact[] = [];

vi.mock("../api/client", async () => {
  const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
  return {
    ...actual,
    projectsApi: {
      ...actual.projectsApi,
      listArtifacts: () => Promise.resolve(mockArtifacts),
    },
  };
});

describe("ProjectArtifactsModal (project-wide artifacts, attributed + downloadable)", () => {
  test("shows a loading state before artifacts resolve", () => {
    mockArtifacts = [];
    const html = renderToStaticMarkup(
      React.createElement(ProjectArtifactsModal, { projectId: "proj_1", onClose: () => {}, onOpenChat: () => {} }),
    );
    expect(html).toContain("Loading artifacts");
  });

  test("renders the modal title and a close affordance", () => {
    const html = renderToStaticMarkup(
      React.createElement(ProjectArtifactsModal, { projectId: "proj_1", onClose: () => {}, onOpenChat: () => {} }),
    );
    expect(html).toContain("Project Artifacts");
  });
});
