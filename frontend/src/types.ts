export interface UserPublic {
  user_id: string;
  username: string;
  email: string | null;
  is_admin: boolean;
  created_at: string;
}

export type ProjectLayer = "silver" | "gold" | "bronze";
export type TargetPlatform = "postgresql" | "snowflake" | "sqlserver";

export interface Project {
  project_id: string;
  owner_user_id: string;
  name: string;
  layer: ProjectLayer;
  domain: string;
  target_platform: TargetPlatform | null;
  collaborator_user_ids: string[];
  created_at: string;
}

export interface Collaborator {
  user_id: string;
  username: string;
  email: string | null;
  is_owner: boolean;
}

export interface RawFileColumn {
  column_name: string;
  dtype: string;
  null_pct: number;
  distinct_count: number;
  distinct_count_approximate: boolean;
  min_value?: unknown;
  max_value?: unknown;
}

export interface RawFile {
  raw_file_id: string;
  project_id: string | null;
  original_filename: string;
  table_name: string;
  row_count: number;
  column_count: number;
  columns: RawFileColumn[];
  uploaded_at: string;
}

export interface Citation {
  source_doc_id: string;
  chunk_id: string;
  title: string;
  chunk_index: number;
  char_start: number;
  char_end: number;
  snippet: string;
  score?: number;
}

export interface MatchedSkillPreview {
  skill_id: string;
  title: string;
  purpose?: string;
  kind?: SkillKind;
  hitl_mode?: HitlMode;
  version?: number;
}

export interface CreateProjectPrompt {
  suggested_domain: string | null;
  suggested_layer: ProjectLayer;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  created_at: string;
  matched_skills?: MatchedSkillPreview[];
  citations?: Citation[];
  skill_preview?: MatchedSkillPreview;
  missing_info?: string[];
  create_project_prompt?: CreateProjectPrompt | null;
}

export interface Chat {
  chat_id: string;
  project_id: string | null;
  user_id: string;
  title: string;
  title_is_default: boolean;
  orchestrator_model: string | null;
  messages: ChatMessage[];
  created_at: string;
}

export type ReasoningEventType =
  | "log"
  | "node"
  | "agent_call"
  | "tool_start"
  | "tool_end"
  | "token"
  | "error"
  | "citations";

export interface ReasoningEvent {
  type: ReasoningEventType;
  payload: {
    source: string;
    message?: string;
    node?: string;
    phase?: "enter" | "exit";
    target?: string;
    tool?: string;
    input?: unknown;
    output_preview?: string;
    content?: string;
    citations?: unknown[];
    [key: string]: unknown;
  };
}

export type ContractEventType =
  | "plan_ready"
  | "run_completed"
  | "hitl_pending"
  | "skill_import_clarification"
  | "kb_ingest_complete"
  | "kb_ingest_failed";

export interface ContractEvent {
  type: ContractEventType;
  payload: { contract_id?: string; pending_tasks?: string[]; [key: string]: unknown };
}

export type HitlMode = "auto" | "confidence_gated" | "mandatory";

export interface PlannedTask {
  task_id: string;
  skill_id: string;
  skill_version: number;
  stage: number;
  hitl_mode: HitlMode;
  hitl_reason: string;
  alternative_skill_id: string | null;
  user_selected: boolean;
}

export interface PlanComment {
  author_user_id: string;
  text: string;
  created_at: string;
}

export type ContractStatus = "draft" | "approved" | "running" | "paused" | "completed" | "failed";

export interface ExecutionContract {
  contract_id: string;
  project_id: string;
  chat_id: string;
  workflow_skill_id: string;
  modeling_style: string;
  status: ContractStatus;
  stages: Record<string, PlannedTask[]>;
  source_refs: { raw_file_id: string | null; db_connection_id: string | null }[];
  user_selected_skills: Record<string, string>;
  comments: PlanComment[];
  immutable: boolean;
  created_at: string;
  approved_at: string | null;
}

export interface HitlGate {
  task_id: string;
  mode: HitlMode;
  reason: string;
  status: "pending" | "approved" | "edited";
  result_snapshot: Record<string, unknown> | null;
  user_override: boolean;
}

export interface TaskResult {
  output?: Record<string, unknown>;
  confidence?: number;
  citations?: unknown[];
  skill_id?: string;
  user_override?: boolean;
  [key: string]: unknown;
}

export interface RunState {
  contract_id: string;
  current_stage: number;
  stage_status: Record<string, string>;
  task_results: Record<string, TaskResult>;
  hitl_gates: HitlGate[];
  checkpoint_id: string | null;
  updated_at: string;
}

export type SkillKind = "task" | "utility" | "workflow";
export type SkillScope = "global" | "org" | "user";

export interface Skill {
  skill_id: string;
  kind: SkillKind;
  scope: SkillScope;
  version: number;
  title: string;
  purpose: string;
  prompt: string;
  tools: string[];
  expected_output: string;
  hitl_mode: HitlMode | null;
  hitl_reason: string | null;
  stage: number | null;
  modeling_style: string | null;
  created_by_user_id: string | null;
  created_at: string;
}

export interface SkillDraftExtracted {
  skill_id?: string;
  kind?: SkillKind;
  title?: string;
  purpose?: string;
  prompt?: string;
  tools?: string[];
  expected_output?: string;
  stage?: number;
  modeling_style?: string;
  hitl_mode?: HitlMode;
  hitl_reason?: string;
  [key: string]: unknown;
}

export interface SkillDraft {
  draft_id: string;
  project_id: string;
  extracted: SkillDraftExtracted;
  missing_fields: string[];
  status: "pending" | "awaiting_clarification" | "approved";
  target_scope: SkillScope;
  created_at: string;
}

export type KbDocumentStatus = "processing" | "ready" | "failed";

export interface KbDocument {
  doc_id: string;
  title: string;
  filename: string;
  doc_type: "kb_reference";
  char_length: number;
  chunk_count: number;
  chunking_strategy: string;
  status: KbDocumentStatus;
  uploaded_by: string;
  uploaded_at: string;
}

export interface KbDocumentDetail {
  doc_id: string;
  title: string;
  full_text: string;
  status: KbDocumentStatus;
  chunks: { chunk_id: string; chunk_index: number; char_start: number; char_end: number }[];
}

export interface AdminKbConfig {
  kb_types: Record<string, string>;
  chunking_strategies: Record<string, string>;
}

export interface ProvenanceEntry {
  task_id: string;
  skill_id: string;
  skill_version: number;
  user_selected: boolean;
  hitl_mode: HitlMode;
  hitl_outcome: string;
  confidence: number | null;
  knowledge_used: Citation[];
}

export interface ProvenanceReport {
  report_id: string;
  contract_id: string;
  entries: ProvenanceEntry[];
  generated_at: string;
}

export interface DbConnection {
  db_connection_id: string;
  project_id: string;
  dialect: string;
  dsn_ref: string;
  created_at: string;
}

export type LlmProvider = "gateway" | "custom" | "openrouter" | "groq" | "nvidia";

export interface UserSettings {
  provider: LlmProvider;
  base_url: string;
  default_model: string;
  embedding_model: string;
  api_key_configured?: boolean;
  api_key_masked?: string;
  openrouter_api_key_configured?: boolean;
  openrouter_api_key_masked?: string;
  groq_api_key_configured?: boolean;
  groq_api_key_masked?: string;
  nvidia_api_key_configured?: boolean;
  nvidia_api_key_masked?: string;
}

export interface UserSettingsUpdate {
  provider: LlmProvider;
  base_url: string;
  default_model: string;
  embedding_model: string;
  api_key: string;
  openrouter_api_key: string;
  groq_api_key: string;
  nvidia_api_key: string;
}

export interface ModelCatalogEntry {
  id: string;
  name: string;
  provider: string;
  context_length: number | null;
  description: string;
  free: boolean;
}

export interface ModelCatalog {
  provider: string;
  provider_label: string;
  base_url: string;
  count: number;
  models: ModelCatalogEntry[];
  default?: string;
  fallback?: boolean;
  error?: string;
}
