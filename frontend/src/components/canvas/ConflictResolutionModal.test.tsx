import { describe, expect, test } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ConflictResolutionModal } from "./ConflictResolutionModal";

const BASE_PROPS = {
  onTakeTheirs: () => {},
  onKeepMine: () => {},
  onCancel: () => {},
};

describe("ConflictResolutionModal (shared-contract HITL edit conflict)", () => {
  test("shows who last modified it and both resolution actions", () => {
    const html = renderToStaticMarkup(
      React.createElement(ConflictResolutionModal, {
        ...BASE_PROPS,
        myDraftOutput: { primary_key: ["customer_id"] },
        theirOutput: { primary_key: ["order_id"] },
        theirUsername: "bob",
        theirTimestamp: new Date().toISOString(),
      }),
    );
    expect(html).toContain("bob");
    expect(html).toContain("Take their version");
    expect(html).toContain("Keep continuing mine");
  });

  test("renders a field-level diff for dict-shaped outputs (changed field highlighted)", () => {
    const html = renderToStaticMarkup(
      React.createElement(ConflictResolutionModal, {
        ...BASE_PROPS,
        myDraftOutput: { primary_key: ["customer_id"], confidence: 0.8 },
        theirOutput: { primary_key: ["order_id"], confidence: 0.8 },
        theirUsername: "bob",
        theirTimestamp: new Date().toISOString(),
      }),
    );
    expect(html).toContain("Primary Key");
    expect(html).toContain("customer_id");
    expect(html).toContain("order_id");
    // Unchanged fields shouldn't be listed as a diff entry.
    expect(html).not.toContain("Confidence");
  });

  test("falls back to whole-value before/after for array-shaped (non-dict) outputs", () => {
    const html = renderToStaticMarkup(
      React.createElement(ConflictResolutionModal, {
        ...BASE_PROPS,
        myDraftOutput: [{ column: "region_id" }],
        theirOutput: [{ column: "order_id" }],
        theirUsername: "bob",
        theirTimestamp: new Date().toISOString(),
      }),
    );
    expect(html).toContain("Your draft");
    expect(html).toContain("Their version");
    expect(html).toContain("region_id");
    expect(html).toContain("order_id");
  });

  test("shows a no-differences message when the values actually matched", () => {
    const same = { primary_key: ["customer_id"] };
    const html = renderToStaticMarkup(
      React.createElement(ConflictResolutionModal, {
        ...BASE_PROPS,
        myDraftOutput: same,
        theirOutput: { ...same },
        theirUsername: "bob",
        theirTimestamp: new Date().toISOString(),
      }),
    );
    expect(html).toContain("No field-level differences");
  });
});
