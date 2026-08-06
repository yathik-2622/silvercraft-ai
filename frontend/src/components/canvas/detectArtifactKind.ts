import type { ArtifactKind } from "../../types";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Routes a completed task's real output to the right artifact renderer.
 * Verified against every real skill-output shape this app produces (see
 * the plan's Phase 1 section for the literal examples) — order matters,
 * most specific shape first.
 */
export function detectArtifactKind(output: unknown): ArtifactKind {
  if (output === null || output === undefined) return "keyvalue";

  // generate_ddl shape: { tables: [{ table_name, columns: [...] }] }
  if (isPlainObject(output) && Array.isArray(output.tables) && output.tables.length > 0) {
    const first = output.tables[0];
    if (isPlainObject(first) && Array.isArray(first.columns)) return "er-diagram";
  }

  if (Array.isArray(output) && output.length > 0) {
    // generate_conceptual_entities shape: [{ entity_name, attributes: [...] }]
    if (
      output.every(
        (row) => isPlainObject(row) && typeof row.entity_name === "string" && Array.isArray(row.attributes),
      )
    ) {
      return "er-diagram";
    }
    // Flat record array — profile_source, classify_sensitivity, relationship
    // rows, generate_sttm all land here; TaskOutputRenderer already knows
    // how to render a record array as one table.
    if (output.every((row) => isPlainObject(row))) return "table";
  }

  // A raw prose/DDL-as-text final answer, or the single-field fallback
  // shape ADM_parse_worker_output produces when the LLM's answer wasn't
  // valid JSON.
  if (typeof output === "string") return "markdown";
  if (isPlainObject(output) && typeof output.raw_text === "string" && Object.keys(output).length === 1) {
    return "markdown";
  }

  if (isPlainObject(output)) return "keyvalue";

  return "keyvalue";
}
