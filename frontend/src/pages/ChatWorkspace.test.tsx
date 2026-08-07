import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ADM_clampCanvasWidth } from "./ChatWorkspace";

describe("ADM_clampCanvasWidth (Phase 7 resizable canvas clamping)", () => {
  test("passes through values already inside [360, 900]", () => {
    expect(ADM_clampCanvasWidth(480)).toBe(480);
    expect(ADM_clampCanvasWidth(360)).toBe(360);
    expect(ADM_clampCanvasWidth(900)).toBe(900);
  });

  test("clamps below the minimum up to 360", () => {
    expect(ADM_clampCanvasWidth(0)).toBe(360);
    expect(ADM_clampCanvasWidth(-500)).toBe(360);
    expect(ADM_clampCanvasWidth(200)).toBe(360);
  });

  test("clamps above the maximum down to 900", () => {
    expect(ADM_clampCanvasWidth(1200)).toBe(900);
    expect(ADM_clampCanvasWidth(901)).toBe(900);
  });
});

describe("ChatWorkspace contract resolution (shared per-project contract)", () => {
  test("resolves the contract by project_id via projectsApi.getContract, not by matching chat_id", () => {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(__dirname, "./ChatWorkspace.tsx"), "utf-8");
    // Contracts are shared per-project now — every chat in a project must
    // land on the same contract, so the old "list all contracts for this
    // project, then find the one whose chat_id matches" lookup must be
    // gone. A regression here would silently re-fork the canvas back into
    // one-independent-model-per-chat.
    expect(src).not.toContain("c.chat_id === activeChatId");
    expect(src).toMatch(/projectsApi\s*\.getContract\(project\.project_id\)/);
  });
});
