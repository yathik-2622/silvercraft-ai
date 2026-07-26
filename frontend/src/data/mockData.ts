import {
  AgentMarketplaceItem,
  HitlStageInfo
} from "../types";

export const HITL_STAGES: HitlStageInfo[] = [
  {
    id: "1-source-analysis",
    stepNumber: 1,
    title: "Source Analysis",
    subtitle: "Data Profiler, Dictionary, PII Classification, Source ER",
    artifacts: [
      "Data Profiler Report (.xlsx)",
      "Data Dictionary (.xlsx)",
      "Classification Matrix (.xlsx)",
      "Source Relational Diagram"
    ]
  },
  {
    id: "2-conceptual",
    stepNumber: 2,
    title: "Conceptual Model",
    subtitle: "Business Concepts, High-Level Relationships, Cardinalities",
    artifacts: [
      "Concepts & Relationships (.xlsx)",
      "Conceptual ER Diagram (SVG/PNG)",
      "Domain Business Dictionary"
    ]
  },
  {
    id: "3-logical",
    stepNumber: 3,
    title: "Logical Model",
    subtitle: "Entities, Attributes, Datatypes, PK/FK, Normalization",
    artifacts: [
      "Logical Model Specification (.xlsx)",
      "Logical ER Diagram (SVG/PNG)",
      "Data Governance Rules"
    ]
  },
  {
    id: "4-physical-sttm",
    stepNumber: 4,
    title: "Physical Model & STTM",
    subtitle: "Physical Tables, Partitioning, STTM Matrix, DDL Code",
    artifacts: [
      "Source-to-Target STTM Matrix (.xlsx)",
      "Target DDL Script (.sql)",
      "Physical ER Diagram",
      "DQ Validation Rules Suite"
    ]
  }
];

export const PREDEFINED_AGENTS: AgentMarketplaceItem[] = [
  {
    id: "agent-source-profiler",
    name: "Source Data Profiler Agent",
    role: "Automated Data Profiler & Quality Metrics",
    description: "Analyzes raw source schemas, computes statistical distributions, null ratios, cardinality counts, and sample row summaries.",
    category: "Profiling",
    iconName: "BarChart3",
    systemPrompt: "Analyze incoming source datasets. Compute null percentages, distinct counts, schema structure, and flag suspicious anomalies.",
    inputTypes: ["CSV", "JSON", "XLSX", "DB Schema"],
    outputArtifacts: ["Data Profiler Report", "Data Dictionary"],
    isPredefined: true,
    rating: 4.9,
    usageCount: 1420
  },
  {
    id: "agent-pii-guard",
    name: "PII & Compliance Guard Agent",
    role: "HIPAA / GDPR / CCPA Data Classifier",
    description: "Scans column names and samples to automatically assign sensitivity tiers (PII, Financial, Sensitive, Operational) and propose masking rules.",
    category: "Compliance & DQ",
    iconName: "ShieldCheck",
    systemPrompt: "Scan schema columns for PII (names, emails, SSNs, phone numbers, addresses, IP addresses). Assign appropriate security tags and masking policies.",
    inputTypes: ["Data Dictionary", "Column Samples"],
    outputArtifacts: ["Classification Matrix", "Masking Rules"],
    isPredefined: true,
    rating: 4.8,
    usageCount: 980
  },
  {
    id: "agent-conceptual-architect",
    name: "Conceptual Architect Agent",
    role: "Domain Ontology & Concept Miner",
    description: "Extracts high-level business domain entities, core concepts, business keys, and relationship cardinalities (1:1, 1:N, N:M).",
    category: "Conceptual",
    iconName: "BrainCircuit",
    systemPrompt: "Synthesize high level domain entities from business requirements or source profiles. Establish clear business boundaries and cardinality rules.",
    inputTypes: ["Domain Prompt", "Source Profiles"],
    outputArtifacts: ["Conceptual Diagram", "Business Terms Matrix"],
    isPredefined: true,
    rating: 4.9,
    usageCount: 1150
  },
  {
    id: "agent-logical-normalizer",
    name: "Logical Normalizer Agent",
    role: "3NF / Data Vault / Dimensional Modeler",
    description: "Applies enterprise modeling rules to construct normalized logical entities with primary/foreign key definitions, data types, and nullability.",
    category: "Logical",
    iconName: "GitBranch",
    systemPrompt: "Convert conceptual models into clean normalized logical models. Apply standard data typing, primary key naming conventions, and integrity constraints.",
    inputTypes: ["Conceptual Entities", "Business Rules"],
    outputArtifacts: ["Logical Schema Spec", "Logical ER Diagram"],
    isPredefined: true,
    rating: 4.9,
    usageCount: 1680
  },
  {
    id: "agent-sttm-automator",
    name: "STTM Automation Engine",
    role: "Source-to-Target Mapping Synthesizer",
    description: "Generates column-level STTM matrix with cleansing transformations (e.g., TRIM, CAST, NULLIF, UPPER, COALESCE) between Bronze and Silver.",
    category: "Physical",
    iconName: "TableProperties",
    systemPrompt: "Synthesize Source-to-Target Mapping matrix. Map source raw columns to cleansed target silver columns with explicit SQL expression logic.",
    inputTypes: ["Source Schema", "Target Logical Model"],
    outputArtifacts: ["STTM Matrix (.xlsx)", "Mapping Docs"],
    isPredefined: true,
    rating: 5.0,
    usageCount: 2100
  },
  {
    id: "agent-physical-ddl",
    name: "Physical DDL Synthesizer",
    role: "Multi-Dialect SQL & Delta DDL Generator",
    description: "Constructs production DDL scripts for Snowflake, Databricks Delta Lake, BigQuery, PostgreSQL, or Redshift with table clustering and comment annotations.",
    category: "Physical",
    iconName: "FileCode",
    systemPrompt: "Generate syntactically flawless DDL scripts for target cloud database engines. Include foreign key constraints, comments, and partition keys.",
    inputTypes: ["Logical Schema", "STTM Matrix"],
    outputArtifacts: ["Target DDL Script (.sql)", "Physical ER Diagram"],
    isPredefined: true,
    rating: 4.9,
    usageCount: 1890
  },
  {
    id: "agent-dq-guard",
    name: "Data Quality Expectation Suite Builder",
    role: "Automated DQ Checks Synthesizer",
    description: "Synthesizes automated Data Quality tests (Not Null, Regex Validations, Referential Integrity, Min/Max ranges) for Silver layer ingestion.",
    category: "Compliance & DQ",
    iconName: "CheckCircle2",
    systemPrompt: "Generate data quality expectation suites based on physical column metadata, data types, and business constraints.",
    inputTypes: ["STTM Matrix", "Physical Model"],
    outputArtifacts: ["DQ Rule Suite", "Ingestion Assertions"],
    isPredefined: true,
    rating: 4.7,
    usageCount: 740
  }
];
