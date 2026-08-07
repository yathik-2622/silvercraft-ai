import { describe, expect, test } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReasoningAccordion } from "./ReasoningAccordion";
import type { ReasoningEvent } from "../../types";

const EVENTS: ReasoningEvent[] = [
  { type: "node", payload: { source: "solution_agent", node: "execute", phase: "exit" } },
  { type: "tool_start", payload: { source: "solution_agent", tool: "profile_source" } },
];

describe("ReasoningAccordion (premium redesign — no bare monospace log list)", () => {
  test("renders nothing for an empty turn", () => {
    const html = renderToStaticMarkup(React.createElement(ReasoningAccordion, { events: [], isStreaming: false }));
    expect(html).toBe("");
  });

  test("shows the title and a step-count badge", () => {
    const html = renderToStaticMarkup(React.createElement(ReasoningAccordion, { events: EVENTS, isStreaming: false }));
    expect(html).toContain("Reasoning");
    expect(html).toContain("2 steps");
  });

  test("the header previews the latest event's line, not a raw step counter alone", () => {
    const html = renderToStaticMarkup(React.createElement(ReasoningAccordion, { events: EVENTS, isStreaming: false }));
    expect(html).toContain("profile_source");
  });

  test("body content is no longer forced into a single monospace block (font-mono removed from the container)", () => {
    const html = renderToStaticMarkup(React.createElement(ReasoningAccordion, { events: EVENTS, isStreaming: true }));
    expect(html).not.toContain("font-mono");
  });

  test("a single step uses singular 'step' wording", () => {
    const html = renderToStaticMarkup(
      React.createElement(ReasoningAccordion, { events: [EVENTS[0]], isStreaming: false }),
    );
    expect(html).toContain("1 step<");
  });
});
