import { describe, expect, test } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EditableTaskOutput } from "./EditableTaskOutput";

function render(output: unknown) {
  return renderToStaticMarkup(
    React.createElement(EditableTaskOutput, { output: output as any, onChange: () => {} }),
  );
}

describe("EditableTaskOutput (HITL structured inline editing — no raw JSON textarea)", () => {
  test("never renders a raw JSON textarea", () => {
    const html = render([{ parent_table: "orders", confidence: 0.8, rationale: "matches naming" }]);
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("JSON.stringify");
  });

  test("a flat record array renders as a real table with real input cells", () => {
    const html = render([{ parent_table: "orders", confidence: 0.8 }]);
    expect(html).toContain("<table");
    expect(html).toContain('value="orders"');
    expect(html).toContain('value="0.8"');
  });

  test("a per-table array (table_name + nested columns) renders editable per-table sections", () => {
    const html = render([
      {
        table_name: "crm_customers",
        row_count: 5,
        columns: [{ column_name: "cust_id", dtype: "String" }],
      },
    ]);
    expect(html).toContain("crm_customers");
    expect(html).toContain('value="cust_id"');
  });

  test("top-level scalar object fields get a real editable input, not static text", () => {
    const html = render({ confidence: 0.95, notes: "looks good" });
    expect(html).toContain('value="0.95"');
    expect(html).toContain('value="looks good"');
  });

  test("an empty object renders the empty-state message, not a crash", () => {
    const html = render({});
    expect(html).toContain("No output fields");
  });
});
