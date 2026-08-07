import { describe, expect, test } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ArtifactHitlWrapper } from "./ArtifactHitlWrapper";
import type { ChatArtifact } from "../../types";

function buildArtifact(): ChatArtifact {
  return {
    artifact_id: "task_profile",
    task_id: "task_profile",
    skill_id: "profile_source",
    stage: 1,
    label: "Profile Source",
    output: { row_count: 3 },
    confidence: 0.9,
    kind: "table",
    received_at: "2026-01-01T00:00:00Z",
  };
}

describe("ArtifactHitlWrapper (Phase 3 — HITL review moved from graph node click to the artifact canvas)", () => {
  test("passes children through unchanged when isPending is false", () => {
    const html = renderToStaticMarkup(
      React.createElement(ArtifactHitlWrapper, {
        contractId: "contract_1",
        artifact: buildArtifact(),
        revisionCount: 1,
        isPending: false,
        onResolved: () => {},
        children: React.createElement("div", null, "real artifact output"),
      }),
    );
    expect(html).toBe("<div>real artifact output</div>");
  });

  test("shows Approve/Edit controls when isPending is true", () => {
    const html = renderToStaticMarkup(
      React.createElement(ArtifactHitlWrapper, {
        contractId: "contract_1",
        artifact: buildArtifact(),
        revisionCount: 1,
        isPending: true,
        onResolved: () => {},
        children: React.createElement("div", null, "real artifact output"),
      }),
    );
    expect(html).toContain("Approve");
    expect(html).toContain(">Edit<");
    expect(html).toContain("real artifact output");
  });
});
