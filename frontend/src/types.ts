export type FoundationLayer = "silver" | "gold" | "bronze" | "platinum";

export type WorkflowType = "default" | "customized";

export type HitlStageId = 
  | "1-source-analysis"
  | "2-conceptual"
  | "3-logical"
  | "4-physical-sttm";

export interface HitlStageInfo {
  id: HitlStageId;
  stepNumber: number;
  title: string;
  subtitle: string;
  artifacts: string[];
}

export type SensitivityType = "PII" | "Non-PII" | "PHI" | "Sensitive" | "N/A" | "Internal" | "Not Applicable";

export type ClassificationType = "Internal" | "Restricted" | "Confidential" | "Public" | "N/A" | "Operational" | "Financial" | "Sensitive" | "PII" | "PHI";

export interface SourceRelationship {
  id: string;
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
  cardinality: CardinalityType;
  description?: string;
}

export interface SourceColumnProfile {
  id: string;
  tableName: string;
  columnName: string;
  dataType: string;
  nullPercentage: number;
  distinctCount: number;
  totalRows: number;
  sampleValues: string[];
  description: string;
  sensitivity?: SensitivityType;
  classification: ClassificationType;
  maskingStrategy?: string;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
}

export interface SourceTableProfile {
  id: string;
  tableName: string;
  description: string;
  rowCount: number;
  columns: SourceColumnProfile[];
}

export type CardinalityType = "1:1" | "1:N" | "N:M";

export interface ConceptualConcept {
  id: string;
  name: string;
  domain: string;
  description: string;
  keyAttributes: string[];
  x: number;
  y: number;
}

export interface ConceptualRelationship {
  id: string;
  sourceConceptId: string;
  targetConceptId: string;
  relationshipName: string;
  cardinality: CardinalityType;
  description: string;
}

export interface LogicalAttribute {
  id: string;
  name: string;
  dataType: string;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  isNullable: boolean;
  description: string;
  businessRule?: string;
  classification: ClassificationType;
}

export interface LogicalEntity {
  id: string;
  name: string;
  logicalName: string;
  description: string;
  attributes: LogicalAttribute[];
  x: number;
  y: number;
}

export interface LogicalRelationship {
  id: string;
  sourceEntityId: string;
  targetEntityId: string;
  sourceAttributeName: string;
  targetAttributeName: string;
  relationshipName?: string;
  cardinality: CardinalityType;
}

export type SqlDialect = "Snowflake" | "Databricks Delta" | "PostgreSQL" | "BigQuery" | "Redshift";

export interface PhysicalColumn {
  id: string;
  columnName: string;
  dataType: string;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  isNullable: boolean;
  isPartitionKey: boolean;
  isClusteringKey: boolean;
  comment: string;
}

export interface PhysicalTable {
  id: string;
  tableName: string;
  schema: string;
  tableType: "TABLE" | "VIEW" | "TRANSIENT";
  comment: string;
  columns: PhysicalColumn[];
  x: number;
  y: number;
}

export interface SttmMappingRow {
  id: string;
  sourceDatabase?: string;
  sourceSchema?: string;
  sourceTable: string;
  sourceColumn: string;
  sourceType: string;
  joinCondition?: string;
  filterCondition?: string;
  transformationRule: string;
  defaultValue?: string;
  targetDatabase?: string;
  targetSchema?: string;
  targetTable: string;
  targetColumn: string;
  targetType: string;
  targetKeyType?: "PK" | "FK" | "ATTR" | string;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  isNullable?: boolean;
  dqRule?: string;
}

export interface SkillFile {
  id: string;
  name: string;
  size: number;
  type: string;
  content: string;
  uploadedAt: string;
}

export interface ChatMessage {
  id: string;
  sender: "user" | "bot" | "system";
  text: string;
  timestamp: string;
  stageBadge?: HitlStageId;
  suggestedPrompts?: string[];
  requiresApproval?: boolean;
  attachments?: { name: string; type: string; size: number }[];
}

export type ModelingStyle = "Canonical" | "3NF" | "Dimensional" | "Data Vault";

export interface ModelingSessionConfig {
  domain: string;
  modelingStyle: ModelingStyle;
  implementationMode: "Greenfield" | "Iterative Model Refinement";
  uploadedModelFile?: string;
  clientConstraints: string;
  standardNamingRule: "snake_case" | "camelCase" | "PASCAL_CASE";
  selectedSourceType: "CSV" | "JSON" | "XLSX" | "API" | "Database SQL";
  targetDialect: SqlDialect;
  globalContext?: string;
  skillFiles?: SkillFile[];
}

export interface AgentDocument {
  id: string;
  name: string;
  size: string;
  type: string;
  uploadedAt: string;
}

export interface AgentMarketplaceItem {
  id: string;
  name: string;
  role: string;
  description: string;
  category: "Profiling" | "Conceptual" | "Logical" | "Physical" | "Compliance & DQ" | "Custom";
  iconName: string;
  systemPrompt: string;
  inputTypes: string[];
  outputArtifacts: string[];
  skills?: string[];
  documents?: AgentDocument[];
  isPredefined: boolean;
  rating: number;
  usageCount: number;
}

export interface CustomPipelineStep {
  id: string;
  agentId: string;
  order: number;
  customInstructions?: string;
}

export interface SampleDatasetPreset {
  id: string;
  title: string;
  domain: string;
  description: string;
  sourceTables: SourceTableProfile[];
  concepts: ConceptualConcept[];
  conceptRelationships: ConceptualRelationship[];
  logicalEntities: LogicalEntity[];
  logicalRelationships: LogicalRelationship[];
  physicalTables: PhysicalTable[];
  sttmRows: SttmMappingRow[];
}
