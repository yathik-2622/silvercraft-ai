import { describe, expect, test } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { markdownComponents } from "../canvas/renderers/ArtifactMarkdown";

// Phase 1 regression guard: MessageBubble.tsx previously rendered chat
// message content as a raw <div>{message.content}</div>, so an LLM answer
// containing "**bold**" literally showed the asterisks instead of bold
// text (the reported bug). This exercises the exact ReactMarkdown +
// markdownComponents pipeline MessageBubble.tsx now uses, via
// renderToStaticMarkup — no jsdom/testing-library dependency needed, this
// codebase's default Vitest environment is 'node'.
function renderMarkdown(text: string): string {
  return renderToStaticMarkup(
    React.createElement(ReactMarkdown, { remarkPlugins: [remarkGfm], components: markdownComponents }, text),
  );
}

describe("chat markdown rendering", () => {
  test("bold syntax produces a real <strong> element, not literal asterisks", () => {
    const html = renderMarkdown("Your attached files have the following columns: **crm_customers**");
    expect(html).toContain("<strong>crm_customers</strong>");
    expect(html).not.toContain("**crm_customers**");
  });

  test("a GFM table renders as real <table>/<th>/<td> elements", () => {
    const html = renderMarkdown("| Column | Type |\n| --- | --- |\n| id | Int64 |");
    expect(html).toContain("<table");
    expect(html).toContain("<th");
    expect(html).toContain("id");
  });

  test("a numbered list renders as a real <ol>/<li>, not literal '1.' text lines", () => {
    const html = renderMarkdown("1. First step\n2. Second step");
    expect(html).toContain("<ol");
    expect(html).toContain("<li");
  });

  test("plain text with no markdown syntax still renders the text content", () => {
    const html = renderMarkdown("Just a plain sentence with no markdown.");
    expect(html).toContain("Just a plain sentence with no markdown.");
  });
});
