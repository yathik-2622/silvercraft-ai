// Single source of truth for stage display names — was duplicated
// (drifting risk) across ArtifactRendererRegistry, PlanMarkdownView, and
// now ArtifactStageTabs. Keyed by number since that's the artifact/task
// shape; string-keyed contract.stages lookups just String() the number.
export const STAGE_LABEL: Record<number, string> = {
  1: "Source Analysis",
  2: "Conceptual (CDM)",
  3: "Logical (LDM)",
  4: "Physical & STTM (PDM)",
};

export function stageLabel(stage: number): string {
  return STAGE_LABEL[stage] || `Stage ${stage}`;
}
