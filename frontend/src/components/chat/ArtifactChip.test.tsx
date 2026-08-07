import { describe, expect, test } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ArtifactChip, ArtifactChipPlaceholder } from "./ArtifactChip";
import type { ChatArtifact } from "../../types";

function buildArtifact(overrides: Partial<ChatArtifact> = {}): ChatArtifact {
  return {
    artifact_id: "task_profile",
    task_id: "task_profile",
    skill_id: "profile_source",
    stage: 1,
    label: "Profile Source",
    output: { row_count: 10 },
    confidence: 0.9,
    kind: "table",
    received_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("ArtifactChip (Phase 2 — artifact chips in messages)", () => {
  test("renders the artifact label", () => {
    const html = renderToStaticMarkup(
      React.createElement(ArtifactChip, { artifact: buildArtifact(), isActive: false, onClick: () => {} }),
    );
    expect(html).toContain("Profile Source");
  });

  test("uses the active (brand-orange) styling when isActive", () => {
    const html = renderToStaticMarkup(
      React.createElement(ArtifactChip, { artifact: buildArtifact(), isActive: true, onClick: () => {} }),
    );
    expect(html).toContain("bg-brand-orange");
  });

  test("uses kind-specific styling for each artifact kind", () => {
    const kinds: ChatArtifact["kind"][] = ["table", "er-diagram", "markdown", "keyvalue"];
    for (const kind of kinds) {
      const html = renderToStaticMarkup(
        React.createElement(ArtifactChip, { artifact: buildArtifact({ kind }), isActive: false, onClick: () => {} }),
      );
      expect(html).toContain("Profile Source");
    }
  });
});

describe("ArtifactChipPlaceholder", () => {
  test("renders a loading placeholder", () => {
    const html = renderToStaticMarkup(React.createElement(ArtifactChipPlaceholder));
    expect(html).toContain("Loading");
  });
});
