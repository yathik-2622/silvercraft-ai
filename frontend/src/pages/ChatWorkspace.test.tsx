import { describe, expect, test } from "vitest";
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
