import { describe, expect, test } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TaskOutputRenderer } from "./TaskOutputRenderer";

// Real profile_source output shape (screenshotted bug: this used to render
// as a raw tab-separated JSON.stringify string for the nested `columns`
// array inside each row — e.g. `crm_customers 5 6 [{"column_name":...}]`
// — instead of a real table). See the plan's Phase 2 section.
const PROFILE_SOURCE_OUTPUT = [
  {
    table_name: "crm_customers",
    row_count: 5,
    column_count: 6,
    columns: [
      { column_name: "cust_id", dtype: "String", null_pct: 0, distinct_count: 5, anomalies: [] },
      { column_name: "full_name", dtype: "String", null_pct: 0, distinct_count: 5, anomalies: [] },
    ],
  },
];

function render(output: unknown): string {
  return renderToStaticMarkup(React.createElement(TaskOutputRenderer, { output }));
}

describe("TaskOutputRenderer nested-array cell rendering", () => {
  test("a nested record-array inside a row renders as a real nested <table>, not JSON.stringify text", () => {
    const html = render(PROFILE_SOURCE_OUTPUT);
    expect(html).not.toContain("JSON.stringify");
    expect(html).not.toContain('[{&quot;column_name&quot;');
    expect(html).not.toContain('[{"column_name"');
    // The outer table (one row per source table) plus a nested inner
    // table (one row per column) for the `columns` cell -> at least 2
    // <table> elements total.
    const tableCount = (html.match(/<table/g) || []).length;
    expect(tableCount).toBeGreaterThanOrEqual(2);
  });

  test("real column names from the nested array are present as real cell text", () => {
    const html = render(PROFILE_SOURCE_OUTPUT);
    expect(html).toContain("cust_id");
    expect(html).toContain("full_name");
  });

  test("top-level scalar fields still render as a compact single-line row, not a header block", () => {
    const html = render({ confidence: 0.95, notes: "looks good" });
    expect(html).toContain("0.95");
    expect(html).toContain("looks good");
  });

  test("top-level nested array/object fields still get a header label above them", () => {
    const html = render({ subject_areas: [{ name: "Orders", tables: ["orders"] }] });
    expect(html).toContain("Subject Areas");
    expect(html).toContain("Orders");
  });

  test("an empty output object renders the empty-state message, not a crash", () => {
    const html = render({});
    expect(html).toContain("No output fields");
  });

  test("a plain array of scalars still renders as a chip list", () => {
    const html = render({ tags: ["a", "b", "c"] });
    expect(html).toContain(">a<");
    expect(html).toContain(">b<");
  });
});
