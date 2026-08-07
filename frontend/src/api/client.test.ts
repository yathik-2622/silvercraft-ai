import { describe, expect, test } from "vitest";
import { ApiError, parseHitlEditConflict } from "./client";

describe("parseHitlEditConflict (shared-contract HITL edit conflict parsing)", () => {
  test("parses a real 409 conflict body from ADM_hitl_edit", () => {
    const body = {
      conflict: true,
      current_output: { primary_key: ["order_id"] },
      resolved_by_user_id: "user_bob",
      updated_at: "2026-01-01T00:00:00Z",
      revision_count: 2,
    };
    const err = new ApiError(409, JSON.stringify(body));
    const parsed = parseHitlEditConflict(err);
    expect(parsed).toEqual(body);
  });

  test("returns null for a non-409 ApiError", () => {
    const err = new ApiError(500, JSON.stringify({ conflict: true }));
    expect(parseHitlEditConflict(err)).toBeNull();
  });

  test("returns null for a 409 whose body isn't a conflict shape", () => {
    const err = new ApiError(409, "Some other 409 message");
    expect(parseHitlEditConflict(err)).toBeNull();
  });

  test("returns null for a plain Error, not an ApiError", () => {
    expect(parseHitlEditConflict(new Error("network down"))).toBeNull();
  });
});
