import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("PlanCanvas.tsx (Phase 3 regression guard — single dynamic canvas)", () => {
  test("no longer imports reactflow — the Graph/Plan toggle and node graph were removed", () => {
    const src = readFileSync(join(__dirname, "./PlanCanvas.tsx"), "utf-8");
    expect(src).not.toContain("reactflow");
    expect(src).not.toContain("viewMode");
    expect(src).toContain("PlanMarkdownView");
  });

  test("ChatWorkspace.tsx no longer has a rightTab Artifacts/Plan picker", async () => {
    const src = readFileSync(join(__dirname, "../../pages/ChatWorkspace.tsx"), "utf-8");
    expect(src).not.toContain("rightTab");
  });

  test("TaskDetailPanel.tsx and TaskNode.tsx were deleted, not just unlinked", async () => {
    const fs = await import("node:fs");
    expect(fs.existsSync(join(__dirname, "./TaskDetailPanel.tsx"))).toBe(false);
    expect(fs.existsSync(join(__dirname, "./TaskNode.tsx"))).toBe(false);
  });
});
