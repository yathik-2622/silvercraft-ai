import { describe, expect, test } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PlanMarkdownView } from "./PlanMarkdownView";
import type { ExecutionContract } from "../../types";

function buildContract(overrides: Partial<ExecutionContract> = {}): ExecutionContract {
  return {
    contract_id: "contract_1",
    project_id: "proj_1",
    chat_id: "chat_1",
    workflow_skill_id: "wf_1",
    modeling_style: "canonical",
    status: "draft",
    stages: {
      "1": [
        {
          task_id: "task_profile",
          skill_id: "profile_source",
          skill_version: 1,
          stage: 1,
          hitl_mode: "auto",
          hitl_reason: "",
          alternative_skill_id: null,
          user_selected: false,
        },
      ],
    },
    source_refs: [],
    comments: [],
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as ExecutionContract;
}

describe("PlanMarkdownView (Phase 8 — Antigravity-style plan rendering)", () => {
  test("renders a stage heading and a task block, falling back to skill_id before the skill doc loads", () => {
    const html = renderToStaticMarkup(
      React.createElement(PlanMarkdownView, { contract: buildContract(), onCommentAdded: () => {} }),
    );
    expect(html).toContain("Stage 1");
    expect(html).toContain("profile_source");
  });

  test("shows the comment-instruction icon on a draft contract", () => {
    const html = renderToStaticMarkup(
      React.createElement(PlanMarkdownView, { contract: buildContract({ status: "draft" }), onCommentAdded: () => {} }),
    );
    expect(html).toContain("Give this task a direct instruction");
  });

  test("hides the comment-instruction icon once the contract is no longer draft", () => {
    const html = renderToStaticMarkup(
      React.createElement(PlanMarkdownView, { contract: buildContract({ status: "approved" }), onCommentAdded: () => {} }),
    );
    expect(html).not.toContain("Give this task a direct instruction");
  });

  test("renders an existing task-scoped comment as a real instruction chip", () => {
    const contract = buildContract({
      comments: [{ author_user_id: "u1", text: "Use surrogate keys.", created_at: "2026-01-01T00:00:00Z", task_id: "task_profile" }],
    });
    const html = renderToStaticMarkup(React.createElement(PlanMarkdownView, { contract, onCommentAdded: () => {} }));
    expect(html).toContain("Use surrogate keys.");
  });

  test("a plan-wide comment (task_id null) shows in the Plan Comments panel, not as a per-task instruction chip", () => {
    const contract = buildContract({
      comments: [{ author_user_id: "u1", text: "General note.", created_at: "2026-01-01T00:00:00Z", task_id: null }],
    });
    const html = renderToStaticMarkup(React.createElement(PlanMarkdownView, { contract, onCommentAdded: () => {} }));
    // Phase 3 folded the plan-wide comments panel into PlanMarkdownView
    // (it used to only be reachable from the now-removed graph view) — a
    // plan-wide comment SHOULD appear there.
    expect(html).toContain("Plan Comments");
    expect(html).toContain("General note.");
    // It must not ALSO get attached to the unrelated task block as a
    // per-task instruction chip (that's task_id-scoped only).
    const taskBlockMatch = html.match(/<div class="group relative[\s\S]*?<\/div><\/div>/);
    expect(taskBlockMatch?.[0] ?? "").not.toContain("General note.");
  });

  test("passing runState shows a per-task completion status icon", () => {
    const contract = buildContract();
    const runState = {
      contract_id: "contract_1",
      current_stage: 2,
      stage_status: { "1": "done" },
      task_results: { task_profile: { output: {}, confidence: 0.9 } },
      hitl_gates: [],
      checkpoint_id: null,
      updated_at: "2026-01-01T00:00:00Z",
    };
    const html = renderToStaticMarkup(
      React.createElement(PlanMarkdownView, { contract, runState, onCommentAdded: () => {} }),
    );
    expect(html).toContain('title="done"');
  });
});
