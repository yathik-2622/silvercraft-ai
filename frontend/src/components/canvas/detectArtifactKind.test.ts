import { describe, expect, it } from "vitest";
import { detectArtifactKind } from "./detectArtifactKind";

// Real output shapes, captured live from this app (see the plan's Phase 1
// section) — these are the literal `output` field of each skill's
// {output, confidence} envelope, not the envelope itself.
const PROFILE_SOURCE_OUTPUT = [
  {
    table_name: "customers.csv",
    row_count: 5,
    column_count: 6,
    columns: [{ column_name: "customer_id", dtype: "String", null_pct: 0.0, distinct_count: 5, anomalies: [] }],
  },
];

const CLASSIFY_SENSITIVITY_OUTPUT = [{ column_name: "email", sensitivity: "PII", rationale: "..." }];

const GENERATE_STTM_OUTPUT = [
  {
    source_table: "customers.csv",
    source_column: "customer_id",
    target_table: "customers",
    target_column: "customer_id",
    transformation: "Direct mapping",
    sensitivity: "Non-sensitive",
  },
];

const GENERATE_CONCEPTUAL_ENTITIES_OUTPUT = [
  {
    entity_name: "Customer",
    description: "...",
    attributes: [{ attribute_name: "customer_id", sensitivity: "Non-sensitive", flags: ["Primary key"] }],
  },
];

const RELATIONSHIP_OUTPUT = [{ relationship: "customer_id -> full_name", cardinality: "1:1", rationale: "..." }];

const GENERATE_DDL_OUTPUT = {
  tables: [
    {
      table_name: "customers",
      columns: [{ column_name: "customer_id", dtype: "STRING", flags: ["Primary key"] }],
      primary_key: ["customer_id"],
      foreign_keys: [],
    },
  ],
};

describe("detectArtifactKind", () => {
  it("routes profile_source's table/column stats to table", () => {
    expect(detectArtifactKind(PROFILE_SOURCE_OUTPUT)).toBe("table");
  });

  it("routes classify_sensitivity's flat record array to table", () => {
    expect(detectArtifactKind(CLASSIFY_SENSITIVITY_OUTPUT)).toBe("table");
  });

  it("routes generate_sttm's mapping rows to table", () => {
    expect(detectArtifactKind(GENERATE_STTM_OUTPUT)).toBe("table");
  });

  it("routes generate_conceptual_entities' entity+attributes shape to er-diagram", () => {
    expect(detectArtifactKind(GENERATE_CONCEPTUAL_ENTITIES_OUTPUT)).toBe("er-diagram");
  });

  it("routes relationship rows to table (ER-diagram merge deliberately deferred)", () => {
    expect(detectArtifactKind(RELATIONSHIP_OUTPUT)).toBe("table");
  });

  it("routes generate_ddl's tables+columns shape to er-diagram", () => {
    expect(detectArtifactKind(GENERATE_DDL_OUTPUT)).toBe("er-diagram");
  });

  it("routes a plain string to markdown", () => {
    expect(detectArtifactKind("# Some heading\n\nSome prose.")).toBe("markdown");
  });

  it("routes the raw_text JSON-decode-failure fallback shape to markdown", () => {
    expect(detectArtifactKind({ raw_text: "not valid json from the LLM" })).toBe("markdown");
  });

  it("does not misroute a multi-key object containing raw_text as markdown", () => {
    expect(detectArtifactKind({ raw_text: "...", other_field: 1 })).toBe("keyvalue");
  });

  it("falls back to keyvalue for an empty array", () => {
    expect(detectArtifactKind([])).toBe("keyvalue");
  });

  it("falls back to keyvalue for null/undefined", () => {
    expect(detectArtifactKind(null)).toBe("keyvalue");
    expect(detectArtifactKind(undefined)).toBe("keyvalue");
  });

  it("falls back to keyvalue for a generic flat object", () => {
    expect(detectArtifactKind({ a: 1, b: "two" })).toBe("keyvalue");
  });

  it("does not misroute a tables array with no columns as er-diagram", () => {
    expect(detectArtifactKind({ tables: [{ table_name: "x" }] })).toBe("keyvalue");
  });
});
