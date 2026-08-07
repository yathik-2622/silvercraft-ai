import { describe, expect, test } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ModernSelect } from "./ModernSelect";

const OPTIONS = [
  { value: "a", label: "Option A" },
  { value: "b", label: "Option B" },
];

describe("ModernSelect (shared native-<select> replacement)", () => {
  test("never renders a native <select> element", () => {
    const html = renderToStaticMarkup(React.createElement(ModernSelect, { value: "a", onChange: () => {}, options: OPTIONS }));
    expect(html).not.toContain("<select");
  });

  test("shows the current value's label on the trigger", () => {
    const html = renderToStaticMarkup(React.createElement(ModernSelect, { value: "b", onChange: () => {}, options: OPTIONS }));
    expect(html).toContain("Option B");
  });

  test("the option list is collapsed until opened (closed by default)", () => {
    const html = renderToStaticMarkup(React.createElement(ModernSelect, { value: "a", onChange: () => {}, options: OPTIONS }));
    // "Option A" should appear exactly once (the trigger's own label) —
    // the popover list of option buttons only mounts once `open` flips
    // true client-side, so a second occurrence would mean it rendered open.
    expect(html.split("Option A").length - 1).toBe(1);
  });
});
