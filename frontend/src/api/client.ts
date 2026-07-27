import axios from 'axios';
import { useAuthStore } from '../store/useAuthStore';

// Use Vite environment variable or fallback directly to local FastAPI server
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1';

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto-logout on 401
apiClient.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  }
);

// ─── Auth ───────────────────────────────────────────────────
export const authApi = {
  register: (email: string, password: string, full_name: string) =>
    apiClient.post('/auth/register', { email, password, full_name }),

  login: (email: string, password: string) => {
    const form = new URLSearchParams();
    form.append('username', email);
    form.append('password', password);
    return apiClient.post('/auth/login', form, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  },

  me: () => apiClient.get('/auth/me'),
};

// ─── Projects ────────────────────────────────────────────────
export const projectsApi = {
  list: () => apiClient.get('/projects/'),
  grouped: () => apiClient.get('/projects/grouped'),
  create: (data: { name: string; description?: string; domain?: string; sub_domain?: string; layer?: 'foundation' | 'product'; execution_flow?: 'custom'; workflow_mode?: 'orchestrator'; collaborators?: string[] }) => apiClient.post('/projects/', data),
  get: (id: string) => apiClient.get(`/projects/${id}`),
  update: (id: string, data: object) => apiClient.put(`/projects/${id}`, data),
  delete: (id: string) => apiClient.delete(`/projects/${id}`),
  addTeamMember: (id: string, email: string) => apiClient.post(`/projects/${id}/team-members`, { email }),
  removeTeamMember: (id: string, memberId: string) => apiClient.delete(`/projects/${id}/team-members/${memberId}`),
  exportArtifacts: (id: string, format: 'pdf' | 'docx' | 'md', data: object) =>
    apiClient.post(`/projects/${id}/export/${format}`, data, { responseType: 'blob' }),
  pushKnowledgeGraph: (id: string, data: object) => apiClient.post(`/projects/${id}/knowledge-graph`, data),
  uploadFiles: (id: string, category: string, files: File[]) => {
    const form = new FormData();
    form.append('category', category);
    files.forEach((file) => form.append('files', file));
    return apiClient.post(`/projects/${id}/files`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

export const settingsApi = {
  get: () => apiClient.get('/settings'),
  update: (data: object) => apiClient.put('/settings', data),
  discoverModels: () => apiClient.get('/settings/models'),
};

// ─── Skills ──────────────────────────────────────────────────
export const skillsApi = {
  list: () => apiClient.get('/skills/'),
  create: (name: string, description: string, content: string) =>
    apiClient.post('/skills/', { name, description, content }),
  delete: (id: string) => apiClient.delete(`/skills/${id}`),
  listBuiltin: () => apiClient.get('/orchestrator/skills/builtin'),
};

// ─── Agents ──────────────────────────────────────────────────
export const agentsApi = {
  listPredefined: () => apiClient.get('/agents/predefined'),
  listCustom: () => apiClient.get('/agents/'),
  create: (data: object) => apiClient.post('/agents/', data),
};

// ─── Workflows ───────────────────────────────────────────────
export const workflowsApi = {
  listForProject: (projectId: string) => apiClient.get(`/workflows/project/${projectId}`),
  create: (data: object) => apiClient.post('/workflows/', data),
  update: (id: string, steps: object[]) => apiClient.put(`/workflows/${id}`, steps),
};

// Chat-first modeling workspace persistence.
export const sessionsApi = {
  createChat: (projectId: string, title: string, workflowId?: string) => apiClient.post(`/projects/${projectId}/chats`, { title, workflow_id: workflowId }),
  listChats: (projectId: string) => apiClient.get(`/projects/${projectId}/chats`),
  getChat: (chatId: string) => apiClient.get(`/chats/${chatId}`),
  appendMessage: (chatId: string, data: object) => apiClient.post(`/chats/${chatId}/messages`, data),
  renameChat: (chatId: string, title: string) => apiClient.put(`/chats/${chatId}`, { title }),
  deleteChat: (chatId: string) => apiClient.delete(`/chats/${chatId}`),
  listAgentRuns: (projectId: string) => apiClient.get(`/projects/${projectId}/agent-runs`),
  decideHitl: (workflowId: string, gateId: string, data: object) => apiClient.post(`/workflows/${workflowId}/hitl/${gateId}`, data),
};

// ─── Orchestrator ────────────────────────────────────────────
export const orchestratorApi = {
  run: (data: {
    prompt: string;
    current_stage: string;
    workflow_type?: string;
    skills?: string[];
    schema_context?: object;
    messages?: object[];
    remote_agent_uri?: string;
    project_id?: string;
    workflow_id?: string;
    chat_id?: string;
    model_name?: string;
  }) => apiClient.post('/orchestrator/run', data),

  injectSkill: (agent_id: string, skill_key: string, action?: string) =>
    apiClient.post('/orchestrator/inject-skill', { agent_id, skill_key, action }),

  plan: (data: {
    prompt: string;
    project_id?: string;
    source_types?: string[];
    source_files?: string[];
    existing_model_files?: string[];
    standard_naming_notes?: string;
  }) => apiClient.post('/orchestrator/plan', data),

  validateA2A: (card_url: string) => apiClient.post('/orchestrator/a2a/validate', { card_url }),
};
