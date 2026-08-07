import type {
  AdminKbConfig,
  BusinessStandardsDocument,
  Chat,
  Citation,
  Collaborator,
  DbConnection,
  ExecutionContract,
  KbDocument,
  KbDocumentDetail,
  ModelCatalog,
  PlanComment,
  PlannedTask,
  Project,
  ProjectLayer,
  ProvenanceReport,
  RawFile,
  RunState,
  Skill,
  SkillDraft,
  SkillDraftExtracted,
  UserPublic,
  UserSettings,
  UserSettingsUpdate,
} from "../types";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

const TOKEN_KEY = "adm2_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  // FormData bodies must NOT get an explicit Content-Type — fetch sets the
  // multipart boundary itself; forcing application/json here would break
  // any multipart upload (skillsApi.importFile).
  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(options.body && !isFormData ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> | undefined),
  };

  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ? JSON.stringify(body.detail) : detail;
    } catch {
      // response had no JSON body
    }
    throw new ApiError(res.status, detail);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: UserPublic;
}

export const authApi = {
  register: (username: string, password: string, email?: string) =>
    request<TokenResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password, email: email || null }),
    }),
  login: (username: string, password: string) =>
    request<TokenResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  me: () => request<UserPublic>("/auth/me"),
};

export type ProjectScope = "owned" | "shared" | "all";

export const projectsApi = {
  list: (scope: ProjectScope = "all") =>
    request<Project[]>(`/projects?scope=${scope}`),
  get: (projectId: string) => request<Project>(`/projects/${projectId}`),
  create: (name: string, domain: string, layer: ProjectLayer) =>
    request<Project>("/projects", {
      method: "POST",
      body: JSON.stringify({ name, domain, layer }),
    }),
  patch: (projectId: string, updates: { name?: string; domain?: string; target_platform?: string; layer?: ProjectLayer }) =>
    request<Project>(`/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    }),
  remove: (projectId: string) =>
    request<void>(`/projects/${projectId}`, { method: "DELETE" }),
  uploadBusinessStandards: (projectId: string, file: File) => {
    const form = new FormData();
    form.set("file", file);
    return request<{ status: string; project_id: string; char_length: number }>(
      `/projects/${projectId}/business-standards`,
      { method: "PUT", body: form },
    );
  },
  editBusinessStandards: (projectId: string, fullText: string) =>
    request<{ status: string; project_id: string; char_length: number }>(
      `/projects/${projectId}/business-standards`,
      { method: "PATCH", body: JSON.stringify({ full_text: fullText }) },
    ),
  getBusinessStandards: (projectId: string) =>
    request<BusinessStandardsDocument>(`/projects/${projectId}/business-standards`),
  // Every persisted artifact across EVERY chat in the project — the
  // superset chatsApi.listArtifacts (scoped to one chat) can't give — each
  // one tagged with which chat produced it and which user owns that chat.
  listArtifacts: (projectId: string) => request<ProjectArtifact[]>(`/projects/${projectId}/artifacts`),
  // The ONE shared model for this project — resolved by project_id, not
  // chat_id, so every collaborator's chat lands on the same contract (see
  // ADM_ExecutionContract's backend module note). Throws ApiError(404) if
  // no model has been started for this project yet — callers already
  // handle that the same way an empty contracts.list() used to.
  getContract: (projectId: string) => request<ExecutionContract>(`/projects/${projectId}/contract`),
};

export interface ProjectArtifact {
  artifact_id: string;
  chat_id: string;
  skill_id: string;
  stage: number;
  label: string;
  output: unknown;
  confidence: number | null;
  citations: Citation[];
  created_at: string;
  chat_title: string;
  created_by_user_id: string | null;
  created_by_username: string;
}

export interface FileRef {
  raw_file_id?: string | null;
  db_connection_id?: string | null;
}

export const chatsApi = {
  // Omitting projectId hits GET /chats with no query param — the caller's
  // own project-less "dashboard" chats, not every chat everywhere.
  list: (projectId?: string) => request<Chat[]>(projectId ? `/chats?project_id=${projectId}` : "/chats"),
  get: (chatId: string) => request<Chat>(`/chats/${chatId}`),
  // Omitting projectId creates a dashboard chat (project_id: null).
  create: (projectId?: string, title?: string) =>
    request<Chat>("/chats", {
      method: "POST",
      body: JSON.stringify({ project_id: projectId || null, title: title || null }),
    }),
  patch: (chatId: string, updates: { title?: string; orchestrator_model?: string }) =>
    request<Chat>(`/chats/${chatId}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    }),
  remove: (chatId: string) => request<void>(`/chats/${chatId}`, { method: "DELETE" }),
  // Migrates a dashboard chat into a brand-new project — the backend half
  // of the inline "Create Project" card (see ChatWorkspace).
  createProjectForChat: (chatId: string, body: { name: string; domain: string; layer: ProjectLayer }) =>
    request<Project>(`/chats/${chatId}/create-project`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  // Every persisted artifact for this chat (see ADM_stream_artifact) — used
  // to re-hydrate artifact chips on reload, since the WS stream is live-only.
  // Raw server shape — no `kind` (client-derived via detectArtifactKind) and
  // no `task_id` (artifact_id IS the task_id, one-to-one) — see ChatWorkspace's
  // hydration effect for the mapping into the richer ChatArtifact type.
  listArtifacts: (chatId: string) => request<PersistedChatArtifact[]>(`/chats/${chatId}/artifacts`),
};

export interface PersistedChatArtifact {
  artifact_id: string;
  chat_id: string;
  skill_id: string;
  stage: number;
  label: string;
  output: unknown;
  confidence: number | null;
  citations: Citation[];
  created_at: string;
}

export const messagesApi = {
  send: (chatId: string, content: string, fileRefs: FileRef[] = [], selectedSkillIds: string[] = []) =>
    request<{ status: string; chat_id: string }>(`/chats/${chatId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content, file_refs: fileRefs, selected_skill_ids: selectedSkillIds }),
    }),
};

export const contractsApi = {
  list: (projectId: string) => request<ExecutionContract[]>(`/contracts?project_id=${projectId}`),
  get: (contractId: string) => request<ExecutionContract>(`/contracts/${contractId}`),
  patch: (contractId: string, stages: Record<string, PlannedTask[]>) =>
    request<ExecutionContract>(`/contracts/${contractId}`, {
      method: "PATCH",
      body: JSON.stringify({ stages }),
    }),
  approve: (contractId: string) =>
    request<{ status: string; contract_id: string }>(`/contracts/${contractId}/approve`, { method: "POST" }),
  status: (contractId: string) =>
    request<{ contract: ExecutionContract; run_state: RunState | null }>(`/contracts/${contractId}/status`),
  addComment: (contractId: string, text: string, taskId?: string) =>
    request<PlanComment>(`/contracts/${contractId}/comments`, {
      method: "POST",
      body: JSON.stringify(taskId ? { text, task_id: taskId } : { text }),
    }),
  provenance: (contractId: string) => request<ProvenanceReport>(`/contracts/${contractId}/provenance`),
  pushToGit: (contractId: string, repoPath: string, remoteUrl?: string, branch?: string) => {
    const qs = new URLSearchParams({ repo_path: repoPath });
    if (remoteUrl) qs.set("remote_url", remoteUrl);
    if (branch) qs.set("branch", branch);
    // repo_path/remote_url/branch are plain query params on the backend
    // (FastAPI route args with no Body()/Pydantic model), not a JSON body.
    return request<{ status: string; contract_id: string }>(
      `/contracts/${contractId}/push-to-git?${qs.toString()}`,
      { method: "POST" },
    );
  },
  downloadArtifact: async (contractId: string): Promise<{ filename: string }> => {
    const token = getToken();
    const res = await fetch(`${API_BASE_URL}/contracts/${contractId}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const body = await res.json();
        detail = body.detail ? JSON.stringify(body.detail) : detail;
      } catch {
        // no JSON body
      }
      throw new ApiError(res.status, detail);
    }
    const disposition = res.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="?([^"]+)"?/);
    const filename = match ? match[1] : `${contractId}.sql`;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return { filename };
  },
};

export interface DbConnectionCreateFields {
  dialect: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

export const dbConnectionsApi = {
  list: (projectId: string) => request<DbConnection[]>(`/db-connections?project_id=${projectId}`),
  create: (projectId: string, fields: DbConnectionCreateFields) =>
    request<DbConnection>("/db-connections", {
      method: "POST",
      body: JSON.stringify({ project_id: projectId, ...fields }),
    }),
};

export const hitlApi = {
  pending: (contractId: string) =>
    request<{ pending: RunState["hitl_gates"]; task_results: Record<string, unknown> }>(
      `/contracts/${contractId}/hitl/pending`,
    ),
  approve: (contractId: string, taskId: string) =>
    request<{ status: string; task_id: string }>(`/contracts/${contractId}/hitl/${taskId}/approve`, {
      method: "POST",
    }),
  edit: (
    contractId: string,
    taskId: string,
    editedOutput: Record<string, unknown> | unknown[],
    baseRevisionCount?: number,
  ) =>
    request<{ status: string; task_id: string; revision_count: number }>(`/contracts/${contractId}/hitl/${taskId}/edit`, {
      method: "POST",
      body: JSON.stringify({ edited_output: editedOutput, base_revision_count: baseRevisionCount }),
    }),
};

// Thrown by hitlApi.edit specifically for a 409 (see ApiError below for
// the generic HTTP-error path this widens). ApiError's `message` is the
// JSON-stringified `detail` FastAPI's HTTPException(409, {...}) sent —
// this just parses it back into the shape ADM_hitl_edit actually returns,
// so callers don't each re-implement that parsing.
export interface HitlEditConflict {
  conflict: true;
  current_output: unknown;
  resolved_by_user_id: string | null;
  updated_at: string;
  revision_count: number;
}

export function parseHitlEditConflict(err: unknown): HitlEditConflict | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  try {
    const parsed = JSON.parse(err.message);
    return parsed && parsed.conflict ? (parsed as HitlEditConflict) : null;
  } catch {
    return null;
  }
}

export const skillsApi = {
  list: (params: { kind?: string; scope?: string; q?: string; mine?: boolean } = {}) => {
    const qs = new URLSearchParams();
    if (params.kind) qs.set("kind", params.kind);
    if (params.scope) qs.set("scope", params.scope);
    if (params.q) qs.set("q", params.q);
    if (params.mine) qs.set("mine", "true");
    const suffix = qs.toString();
    return request<Skill[]>(`/skills${suffix ? `?${suffix}` : ""}`);
  },
  get: (skillId: string) => request<Skill>(`/skills/${skillId}`),
  import: (projectId: string, rawText: string) =>
    request<{ status: string; draft_id: string }>("/skills/import", {
      method: "POST",
      body: JSON.stringify({ project_id: projectId, raw_text: rawText }),
    }),
  importFile: (projectId: string, file: File) => {
    const form = new FormData();
    form.set("project_id", projectId);
    form.set("file", file);
    return request<
      | { status: "uploaded"; path: "direct_yaml"; skill_id: string; kind: string; version: number; scope: string }
      | { status: "accepted"; path: "normalizer"; draft_id: string }
    >("/skills/import-file", { method: "POST", body: form });
  },
};

export const skillDraftsApi = {
  get: (draftId: string) => request<SkillDraft>(`/skill-drafts/${draftId}`),
  patch: (draftId: string, fieldValues: Partial<SkillDraftExtracted>) =>
    request<SkillDraft>(`/skill-drafts/${draftId}`, {
      method: "PATCH",
      body: JSON.stringify(fieldValues),
    }),
  approve: (draftId: string) =>
    request<Skill>(`/skill-drafts/${draftId}/approve`, { method: "POST" }),
};

export const kbApi = {
  getDocument: (docId: string) => request<KbDocumentDetail>(`/kb/documents/${docId}`),
  getTablePreview: (docId: string) => request<{ columns: string[]; rows: Record<string, unknown>[] }>(`/kb/documents/${docId}/table-preview`),
  // The /file route requires the same Bearer-token auth as everything
  // else in this app — a plain <iframe src="..."> can't attach a custom
  // Authorization header, so this fetches the bytes with the header
  // (same pattern contractsApi.downloadArtifact already uses) and hands
  // back a blob: URL the iframe CAN use directly. Caller owns revoking it
  // (URL.revokeObjectURL) once done, same as any other object URL.
  fetchFileBlobUrl: async (docId: string): Promise<{ url: string; mediaType: string }> => {
    const token = getToken();
    const res = await fetch(`${API_BASE_URL}/kb/documents/${docId}/file`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new ApiError(res.status, res.statusText);
    const mediaType = res.headers.get("Content-Type") || "application/octet-stream";
    const blob = await res.blob();
    return { url: URL.createObjectURL(blob), mediaType };
  },
};

export const adminApi = {
  getKbConfig: () => request<AdminKbConfig>("/admin/kb/config"),
  listDocuments: () => request<KbDocument[]>("/admin/kb/documents"),
  deleteDocument: (docId: string) => request<{ status: string; doc_id: string; chunks_removed: number }>(
    `/admin/kb/documents/${docId}`,
    { method: "DELETE" },
  ),
  uploadModeling: (files: File[], title: string, chunkingStrategy: string) => {
    const form = new FormData();
    form.set("kb_type", "modeling");
    files.forEach((f) => form.append("files", f));
    if (title) form.set("title", title);
    form.set("chunking_strategy", chunkingStrategy);
    return request<{ results: Array<{ filename: string; status: string; [key: string]: unknown }> }>(
      "/admin/kb/upload",
      { method: "POST", body: form },
    );
  },
  uploadSkill: (files: File[], projectId?: string) => {
    const form = new FormData();
    form.set("kb_type", "skill");
    files.forEach((f) => form.append("files", f));
    if (projectId) form.set("project_id", projectId);
    return request<{ results: Array<{ filename: string; status: string; [key: string]: unknown }> }>(
      "/admin/kb/upload",
      { method: "POST", body: form },
    );
  },
};

export const uploadsApi = {
  // project_id omitted -> a dashboard (project-less) chat's attachment.
  upload: (file: File, projectId?: string) => {
    const form = new FormData();
    form.set("file", file);
    if (projectId) form.set("project_id", projectId);
    return request<RawFile>("/uploads", { method: "POST", body: form });
  },
  get: (rawFileId: string) => request<RawFile>(`/uploads/${rawFileId}`),
};

export const settingsApi = {
  get: () => request<{ settings: UserSettings }>("/settings").then((r) => r.settings),
  update: (body: UserSettingsUpdate) =>
    request<{ settings: UserSettings }>("/settings", { method: "PUT", body: JSON.stringify(body) }).then(
      (r) => r.settings,
    ),
  discoverModels: () => request<ModelCatalog>("/settings/models"),
};

export const collaboratorsApi = {
  list: (projectId: string) =>
    request<Collaborator[]>(`/projects/${projectId}/collaborators`),
  add: (projectId: string, username: string) =>
    request<unknown>(`/projects/${projectId}/collaborators`, {
      method: "POST",
      body: JSON.stringify({ username }),
    }),
  remove: (projectId: string, userId: string) =>
    request<void>(`/projects/${projectId}/collaborators/${userId}`, {
      method: "DELETE",
    }),
};
