import { describe, expect, test } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ArtifactStageTabs } from "./ArtifactStageTabs";
import type { ChatArtifact } from "../../types";

function buildArtifact(overrides: Partial<ChatArtifact>): ChatArtifact {
  return {
    artifact_id: "task_1",
    task_id: "task_1",
    skill_id: "profile_source",
    stage: 1,
    label: "Profile Source",
    output: {},
    confidence: 0.9,
    kind: "table",
    received_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("ArtifactStageTabs (stages as main tabs, tasks as sub-tabs)", () => {
  test("renders nothing when there are no artifacts", () => {
    const html = renderToStaticMarkup(React.createElement(ArtifactStageTabs, { artifacts: [], activeId: null, onSelect: () => {} }));
    expect(html).toBe("");
  });

  test("groups artifacts under one main tab per stage, in stage order", () => {
    const artifacts = [
      buildArtifact({ artifact_id: "t1", task_id: "t1", stage: 2, label: "Classify Entities" }),
      buildArtifact({ artifact_id: "t2", task_id: "t2", stage: 1, label: "Profile Source" }),
    ];
    const html = renderToStaticMarkup(React.createElement(ArtifactStageTabs, { artifacts, activeId: null, onSelect: () => {} }));
    expect(html).toContain("Stage 1");
    expect(html).toContain("Stage 2");
    expect(html.indexOf("Stage 1")).toBeLessThan(html.indexOf("Stage 2"));
  });

  test("the stage containing the active artifact starts expanded (its sub-tabs are rendered)", () => {
    const artifacts = [
      buildArtifact({ artifact_id: "t1", task_id: "t1", stage: 1, label: "Profile Source" }),
      buildArtifact({ artifact_id: "t2", task_id: "t2", stage: 2, label: "Classify Entities" }),
    ];
    const html = renderToStaticMarkup(React.createElement(ArtifactStageTabs, { artifacts, activeId: "t2", onSelect: () => {} }));
    expect(html).toContain("Classify Entities");
  });

  test("a stage with no active artifact starts collapsed (its sub-tabs are not rendered)", () => {
    const artifacts = [
      buildArtifact({ artifact_id: "t1", task_id: "t1", stage: 1, label: "Profile Source" }),
      buildArtifact({ artifact_id: "t2", task_id: "t2", stage: 2, label: "Classify Entities" }),
    ];
    const html = renderToStaticMarkup(React.createElement(ArtifactStageTabs, { artifacts, activeId: "t1", onSelect: () => {} }));
    expect(html).not.toContain("Classify Entities");
  });

  test("multiple tasks within the same stage all render as sub-tabs once that stage is open", () => {
    const artifacts = [
      buildArtifact({ artifact_id: "t1", task_id: "t1", stage: 1, label: "Profile Source" }),
      buildArtifact({ artifact_id: "t2", task_id: "t2", stage: 1, label: "Discover Relationships" }),
    ];
    const html = renderToStaticMarkup(React.createElement(ArtifactStageTabs, { artifacts, activeId: "t1", onSelect: () => {} }));
    expect(html).toContain("Profile Source");
    expect(html).toContain("Discover Relationships");
  });
});
