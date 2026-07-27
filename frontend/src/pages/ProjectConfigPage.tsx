import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Edge, MarkerType, Node } from 'reactflow';
import {
  ArrowLeft, ArrowRight, Bot, BookOpen, ChevronRight, Database, FileJson,
  GitBranch, Layers, Play, Plus, Settings2, SlidersHorizontal, Table2,
  Trash2, Upload, Workflow, X, Zap, Moon, Sun
} from 'lucide-react';
import WorkflowCanvas from '../components/flow/WorkflowCanvas';
import { agentsApi, orchestratorApi, projectsApi, skillsApi, workflowsApi } from '../api/client';
import { useAuthStore } from '../store/useAuthStore';

interface AgentConfig {
  id: string;
  name: string;
  description: string;
  agent_type: string;
  remote_uri?: string;
  default_skills: string[];
}

interface SkillItem {
  id: string;
  name: string;
  description: string;
  content: string;
}

const WORKFLOW_MODES = [
  { id: 'default', label: 'Default Modeling', desc: '4 fixed HITL agents for source, conceptual, logical, physical/STTM', icon: Workflow },
  { id: 'custom', label: 'Custom Modeling', desc: 'Start blank, use the orchestrator, or compose your own agent pipeline', icon: SlidersHorizontal },
] as const;

const DB_PROVIDERS = ['Snowflake', 'BigQuery', 'Postgres', 'SQL Server', 'MySQL', 'Oracle', 'Databricks'];
const TARGET_DIALECTS = ['Snowflake', 'Databricks Delta', 'PostgreSQL', 'BigQuery', 'Redshift'];
const BUILTIN_SKILLS = ['source-analysis', 'pii-classification', '3nf-normalization', 'dimensional-modeling', 'data-vault', 'sttm'];
const defaultPipelineIds = ['agent-source-profiler', 'agent-conceptual-modeler', 'agent-logical-normalizer', 'agent-sttm-automator'];
type CustomBuilderMode = 'diy' | 'orchestrator';

const toNode = (agent: AgentConfig, index: number): Node => ({
  id: `${agent.id}-${Date.now()}-${index}`,
  type: 'agent',
  position: { x: 110 + index * 280, y: 170 },
  data: {
    agentId: agent.id,
    agent_id: agent.id,
    name: agent.name,
    description: agent.description,
    framework: agent.agent_type === 'remote' ? 'A2A Remote' : '',
    status: 'idle',
    model: 'gpt-4o',
    model_name: 'gpt-4o',
    skills: agent.default_skills.join(', '),
    tools: agent.default_skills,
    inputs: 'project source inputs, existing model files, standard naming rules',
    knowledgeFiles: '',
    hitlEnabled: true,
    hitl_enabled: true,
    a2aEnabled: agent.agent_type === 'remote',
    a2a_enabled: agent.agent_type === 'remote',
    a2a_mode: agent.agent_type === 'remote' ? 'remote' : 'local',
    remoteUri: agent.remote_uri ?? '',
    remote_agent_card_url: agent.remote_uri ?? '',
    customPrompt: '',
    system_prompt: '',
    kgOptIn: false,
    input_bindings: {
      include_text_input: true,
      include_uploaded_files: true,
      include_source_inputs: true,
      include_knowledge_base: true,
      include_upstream_outputs: true,
      include_existing_model: true,
    },
  },
});

const makeEdges = (nodes: Node[]): Edge[] =>
  nodes.slice(0, -1).map((node, index) => ({
    id: `edge-${node.id}-${nodes[index + 1].id}`,
    source: node.id,
    target: nodes[index + 1].id,
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed },
  }));

const readFilesAsSkill = async (files: File[]) => {
  const chunks = await Promise.all(files.map(async (file) => `## Uploaded File: ${file.name}\n\n${await file.text()}`));
  return chunks.join('\n\n---\n\n');
};

export const ProjectConfigPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthStore();
  const locationState = location.state as { name?: string; description?: string } | null;

  const [screen, setScreen] = useState<'mode' | 'builder'>('mode');
  const [projectName, setProjectName] = useState(locationState?.name ?? 'New Project');
  const [projectDescription, setProjectDescription] = useState(locationState?.description ?? '');
  const [projectLayer, setProjectLayer] = useState<'foundation' | 'product'>('foundation');
  const [workflowMode, setWorkflowMode] = useState<'default' | 'custom'>('default');
  const [customBuilderMode, setCustomBuilderMode] = useState<CustomBuilderMode>('diy');
  const [leftPanelWidth, setLeftPanelWidth] = useState(420);
  const [sourceInputKind, setSourceInputKind] = useState<'files' | 'database'>('files');
  const [sourceFileNames, setSourceFileNames] = useState<string[]>([]);
  const [existingModelFiles, setExistingModelFiles] = useState<string[]>([]);
  const [standardNamingNotes, setStandardNamingNotes] = useState('');
  const [standardNamingFiles, setStandardNamingFiles] = useState<string[]>([]);
  const [standardNamingSkillId, setStandardNamingSkillId] = useState('');
  const [domain, setDomain] = useState('E-Commerce & Retail Sales');
  const [targetDialect, setTargetDialect] = useState('Snowflake');
  const [databaseConnection, setDatabaseConnection] = useState({
    provider: 'Snowflake',
    host: '',
    port: '',
    database: '',
    username: '',
    password: '',
  });
  const [orchestratorPrompt, setOrchestratorPrompt] = useState('/dimensional-modeling for this project source');
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [saving, setSaving] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState('');
  const [canvasTheme, setCanvasTheme] = useState<'dark' | 'light'>('light');
  const [isCreateAgentOpen, setIsCreateAgentOpen] = useState(false);
  const [isCreateSkillOpen, setIsCreateSkillOpen] = useState(false);
  const [newSkill, setNewSkill] = useState({ name: '', description: '', content: '', files: [] as File[] });
  const [newAgent, setNewAgent] = useState({
    name: '',
    description: '',
    defaultSkills: '',
    remoteUri: '',
    a2aEnabled: false,
    handshakePath: '/.well-known/agent-card.json',
  });
  const [a2aStatus, setA2aStatus] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const [projectRes, predefinedRes, customRes, skillsRes] = await Promise.all([
          id ? projectsApi.get(id) : Promise.reject(new Error('Missing project ID')),
          agentsApi.listPredefined(),
          agentsApi.listCustom(),
          skillsApi.list(),
        ]);
        const loadedAgents = [...(predefinedRes.data ?? []), ...(customRes.data ?? [])];
        setAgents(loadedAgents.filter((agent, index, list) => list.findIndex((item) => item.id === agent.id || item.name === agent.name) === index));
        setSkills(skillsRes.data ?? []);

        const project = projectRes.data;
        setProjectName(project.name);
        setProjectDescription(project.description ?? '');
        setProjectLayer(project.layer ?? 'foundation');
        const cfg = project.source_connects ?? {};
        setSourceInputKind(cfg.sourceInputKind ?? 'files');
        setSourceFileNames(cfg.sourceFileNames ?? []);
        setExistingModelFiles(cfg.existingModelFiles ?? []);
        setStandardNamingFiles(cfg.standardNamingFiles ?? []);
        setStandardNamingSkillId(cfg.standardNamingSkillId ?? '');
        setWorkflowMode(project.execution_flow ?? cfg.workflowMode ?? 'default');
        setCustomBuilderMode(project.workflow_mode === 'orchestrator' ? 'orchestrator' : 'diy');
        setDomain(project.domain ?? cfg.domain ?? 'E-Commerce & Retail Sales');
        setTargetDialect(project.target_dialect ?? cfg.targetDialect ?? 'Snowflake');
        setStandardNamingNotes(cfg.standardNamingNotes ?? '');
        setOrchestratorPrompt(cfg.orchestratorPrompt ?? '/dimensional-modeling for this project source');
        setDatabaseConnection({ provider: 'Snowflake', host: '', port: '', database: '', username: '', password: '', ...(cfg.databaseConnection ?? {}) });
        if (cfg.workflowNodes?.length) {
          setNodes(cfg.workflowNodes);
          setEdges(cfg.workflowEdges ?? makeEdges(cfg.workflowNodes));
        }
      } catch {
        setError('Unable to load project setup. Confirm backend, database, and authentication are running.');
      }
    };
    load();
  }, [id]);

  useEffect(() => {
    if (screen !== 'builder' || workflowMode !== 'default' || nodes.length || !agents.length) return;
    setPipelineForMode('default');
  }, [screen, workflowMode, agents.length]);

  const selectedAgentIds = useMemo(() => nodes.map((node) => node.data.agentId), [nodes]);

  const setPipelineForMode = (mode = workflowMode) => {
    if (mode === 'custom') {
      setNodes([]);
      setEdges([]);
      return;
    }

    const selectedAgents = defaultPipelineIds.map((agentId) => agents.find((agent) => agent.id === agentId));
    const missing = defaultPipelineIds.filter((_, index) => !selectedAgents[index]);
    if (missing.length) {
      setError(`Missing required system agents: ${missing.join(', ')}. Refresh after backend agent seeding completes.`);
      setNodes([]);
      setEdges([]);
      return;
    }
    const nextNodes = selectedAgents.map((agent, index) => toNode(agent as AgentConfig, index));
    setNodes(nextNodes);
    setEdges(makeEdges(nextNodes));
  };

  const selectMode = (mode: 'default' | 'custom') => {
    setWorkflowMode(mode);
    setScreen('builder');
    setPipelineForMode(mode);
  };

  const uploadProjectFiles = async (category: string, fileList: FileList | null, onUploaded: (names: string[]) => void) => {
    const files = Array.from(fileList ?? []);
    if (!files.length || !id) return;
    setError('');
    try {
      const res = await projectsApi.uploadFiles(id, category, files);
      onUploaded(res.data.map((item: any) => item.filename));
    } catch (err: any) {
      setError(err.response?.data?.detail || `Unable to upload ${category} files.`);
    }
  };

  const generateOrchestratorPipeline = async () => {
    if (!orchestratorPrompt.trim()) {
      setError('Enter an orchestrator instruction, for example /dimensional-modeling or /data-vault.');
      return;
    }
    setPlanning(true);
    setError('');
    try {
      const res = await orchestratorApi.plan({
        prompt: orchestratorPrompt,
        project_id: id,
        source_types: [sourceInputKind],
        source_files: sourceFileNames,
        existing_model_files: existingModelFiles,
        standard_naming_notes: [standardNamingNotes, standardNamingSkillId, ...standardNamingFiles].filter(Boolean).join(', '),
        workflow_mode: 'orchestrator',
        workflow_name: `${projectName} Orchestrated Pipeline`,
        approve_new_agents: false,
      });
      setNodes(res.data.nodes);
      setEdges(res.data.edges);
      const createdAgents = res.data.created_agents?.length ? ` Created agents: ${res.data.created_agents.join(', ')}.` : '';
      const createdSkills = res.data.created_skills?.length ? ` Created skills: ${res.data.created_skills.join(', ')}.` : '';
      const pending = res.data.pending_agent_creations?.length
        ? ` Pending HITL approval: ${res.data.pending_agent_creations.map((item: any) => item.name).join(', ')}.`
        : '';
      setError(`${res.data.hitl_summary}${createdAgents}${createdSkills}${pending}`);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Unable to generate orchestrator pipeline. Check backend, auth, and LLM/env setup.');
    } finally {
      setPlanning(false);
    }
  };

  const addAgent = (agent: AgentConfig) => {
    const nextNodes = [...nodes, toNode(agent, nodes.length)];
    setNodes(nextNodes);
    setEdges(makeEdges(nextNodes));
  };

  const createCustomAgent = async () => {
    if (!newAgent.name.trim()) return;
    try {
      const res = await agentsApi.create({
        name: newAgent.name.trim(),
        description: newAgent.description.trim() || 'Custom project agent',
        agent_type: newAgent.a2aEnabled ? 'remote' : 'local',
        remote_uri: newAgent.remoteUri.trim(),
        default_skills: newAgent.defaultSkills.split(',').map((skill) => skill.trim().replace(/^\//, '')).filter(Boolean),
      });
      const persisted = res.data as AgentConfig;
      setAgents((prev) => [...prev, persisted]);
      addAgent(persisted);
      setIsCreateAgentOpen(false);
      setA2aStatus('');
      setNewAgent({ name: '', description: '', defaultSkills: '', remoteUri: '', a2aEnabled: false, handshakePath: '/.well-known/agent-card.json' });
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Unable to persist custom agent.');
    }
  };

  const testA2AHandshake = async () => {
    if (!newAgent.remoteUri.trim()) {
      setA2aStatus('Enter a remote agent URI first.');
      return;
    }
    const base = newAgent.remoteUri.replace(/\/$/, '');
    const path = newAgent.handshakePath.startsWith('/') ? newAgent.handshakePath : `/${newAgent.handshakePath}`;
    setA2aStatus('Testing remote agent card...');
    try {
      const res = await orchestratorApi.validateA2A(`${base}${path}`);
      setA2aStatus(`Connected to ${res.data.summary.name}. Capabilities: ${res.data.summary.capabilities_count}. Protocol: ${res.data.summary.protocol}.`);
    } catch (err: any) {
      setA2aStatus(err.response?.data?.detail || 'Remote card validation failed.');
    }
  };

  const createStandardNamingSkill = async () => {
    if (!newSkill.name.trim()) return;
    try {
      const fileContent = newSkill.files.length ? await readFilesAsSkill(newSkill.files) : '';
      const content = [
        `# ${newSkill.name.trim()}`,
        '',
        '## Purpose',
        newSkill.description.trim() || 'Project standard naming rules.',
        '',
        '## Standard Naming Rules',
        newSkill.content.trim() || 'Use the uploaded content as the source of truth for standard naming.',
        fileContent ? `\n## Uploaded Reference Content\n\n${fileContent}` : '',
        '',
        '## Output Contract',
        '- Apply these rules consistently to generated entities, attributes, tables, columns, and relationships.',
        '- Preserve domain vocabulary unless a rule explicitly overrides it.',
      ].join('\n');
      const res = await skillsApi.create(newSkill.name.trim(), newSkill.description.trim() || 'Standard naming skill', content);
      setSkills((prev) => [...prev, res.data]);
      setStandardNamingSkillId(res.data.id);
      setStandardNamingNotes(`/skill ${res.data.name}`);
      setIsCreateSkillOpen(false);
      setNewSkill({ name: '', description: '', content: '', files: [] });
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Unable to create standard naming skill.');
    }
  };

  const buildPayload = () => ({
    sourceInputKind,
    sourceFileNames,
    existingModelFiles,
    standardNamingFiles,
    standardNamingSkillId,
    workflowMode,
    projectLayer,
    domain,
    targetDialect,
    standardNamingNotes,
    databaseConnection: { ...databaseConnection, password: databaseConnection.password ? '__configured__' : '' },
    orchestratorPrompt,
    workflowNodes: nodes,
    workflowEdges: edges,
  });

  const pipelineAgents = () => nodes.map((node) => ({
    id: node.data.agentId ?? node.id,
    name: node.data.name,
    model: node.data.model ?? node.data.model_name,
    default_skills: String(node.data.skills ?? '').split(',').map((skill) => skill.trim()).filter(Boolean),
    applied_skills: String(node.data.skills ?? '').split(',').map((skill) => skill.trim()).filter(Boolean),
    custom_prompt: node.data.customPrompt ?? node.data.system_prompt ?? '',
    inputs: node.data.inputs ?? '',
    knowledge_files: node.data.knowledgeFiles ?? '',
    hitl_enabled: Boolean(node.data.hitlEnabled ?? node.data.hitl_enabled),
    kg_opt_in: Boolean(node.data.kgOptIn),
    input_bindings: node.data.input_bindings ?? {},
    a2a_enabled: Boolean(node.data.a2aEnabled ?? node.data.a2a_enabled),
    custom_remote_uri: node.data.remoteUri ?? node.data.remote_agent_card_url ?? '',
  }));

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    setError('');
    try {
      const persistedWorkflowType = workflowMode === 'default' ? 'default' : customBuilderMode;
      await projectsApi.update(id, {
        name: projectName,
        description: projectDescription,
        domain,
        layer: projectLayer,
        execution_flow: workflowMode,
        workflow_mode: persistedWorkflowType,
        target_dialect: targetDialect,
        source_connects: buildPayload(),
        naming_rules: standardNamingNotes,
      });
      const workflowRes = await workflowsApi.create({
        project_id: id,
        name: `${projectName} ${persistedWorkflowType} workflow`,
        workflow_type: persistedWorkflowType,
        description: customBuilderMode === 'orchestrator' ? orchestratorPrompt : 'DIY workflow canvas configuration',
        nodes,
        edges,
        input_config: buildPayload(),
        steps: nodes.map((node, index) => ({
          id: node.id,
          agent_id: node.data.agentId ?? node.id,
          agent_name: node.data.name,
          order: index + 1,
          skills: String(node.data.skills ?? '').split(',').map((skill) => skill.trim()).filter(Boolean),
          custom_prompt: node.data.customPrompt ?? node.data.system_prompt ?? '',
          a2a_enabled: Boolean(node.data.a2aEnabled ?? node.data.a2a_enabled),
          remote_uri: node.data.remoteUri ?? node.data.remote_agent_card_url ?? '',
        })),
        created_by: user?.id,
      });
      navigate(`/project/${id}/studio`, {
        state: {
          projectName,
          workflowId: workflowRes.data?.id,
          workflowMode,
          customBuilderMode,
          sourceInputKind,
          sourceFileNames,
          existingModelFiles,
          standardNamingNotes,
          standardNamingFiles,
          standardNamingSkillId,
          domain,
          targetDialect,
          databaseConnection: buildPayload().databaseConnection,
          agents: pipelineAgents(),
          pipelineSteps: nodes.map((node, index) => ({ id: node.id, agentId: node.data.agentId ?? node.id, order: index + 1 })),
        },
      });
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Unable to save project configuration');
    } finally {
      setSaving(false);
    }
  };

  const SourceConfigurationPanel = () => (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
        <h3 className="text-xs font-black text-slate-900 flex items-center gap-2"><Settings2 className="w-3.5 h-3.5 text-[#e67225]" /> Source Inputs</h3>
        <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="Domain / sub-domain" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#e67225]/60" />
        <select value={targetDialect} onChange={(e) => setTargetDialect(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white">
          {TARGET_DIALECTS.map((dialect) => <option key={dialect} value={dialect}>Target dialect: {dialect}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setSourceInputKind('files')} className={`p-3 rounded-lg border text-left transition-all ${sourceInputKind === 'files' ? 'border-[#e67225] bg-[#e67225]/5' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
            <div className="flex items-center gap-2 text-[11px] font-black text-slate-800"><Table2 className="w-4 h-4 text-[#e67225]" /> CSV / XLSX / JSON</div>
            <p className="text-[10px] text-slate-500 mt-1">Upload one or many files.</p>
          </button>
          <button onClick={() => setSourceInputKind('database')} className={`p-3 rounded-lg border text-left transition-all ${sourceInputKind === 'database' ? 'border-[#e67225] bg-[#e67225]/5' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
            <div className="flex items-center gap-2 text-[11px] font-black text-slate-800"><Database className="w-4 h-4 text-[#e67225]" /> Database</div>
            <p className="text-[10px] text-slate-500 mt-1">Read-only connection details.</p>
          </button>
        </div>

        {sourceInputKind === 'files' ? (
          <label className="flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-lg p-3 text-[11px] font-bold text-slate-500 hover:text-[#e67225] hover:border-[#e67225]/40 cursor-pointer">
            <Upload className="w-3.5 h-3.5" /> Upload source files
            <input type="file" multiple accept=".csv,.xlsx,.xls,.json,application/json,text/csv" className="hidden" onChange={(e) => uploadProjectFiles('source', e.target.files, (names) => setSourceFileNames((prev) => [...prev, ...names]))} />
          </label>
        ) : (
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-3">
            <select value={databaseConnection.provider} onChange={(e) => setDatabaseConnection((prev) => ({ ...prev, provider: e.target.value }))} className="col-span-2 border border-slate-200 rounded-lg px-3 py-2 text-xs">
              {DB_PROVIDERS.map((provider) => <option key={provider} value={provider}>{provider}</option>)}
            </select>
            <input value={databaseConnection.host} onChange={(e) => setDatabaseConnection((prev) => ({ ...prev, host: e.target.value }))} placeholder="Host" className="border border-slate-200 rounded-lg px-3 py-2 text-xs" />
            <input value={databaseConnection.port} onChange={(e) => setDatabaseConnection((prev) => ({ ...prev, port: e.target.value }))} placeholder="Port" className="border border-slate-200 rounded-lg px-3 py-2 text-xs" />
            <input value={databaseConnection.database} onChange={(e) => setDatabaseConnection((prev) => ({ ...prev, database: e.target.value }))} placeholder="Database name" className="col-span-2 border border-slate-200 rounded-lg px-3 py-2 text-xs" />
            <input value={databaseConnection.username} onChange={(e) => setDatabaseConnection((prev) => ({ ...prev, username: e.target.value }))} placeholder="Read-only username" className="border border-slate-200 rounded-lg px-3 py-2 text-xs" />
            <input type="password" value={databaseConnection.password} onChange={(e) => setDatabaseConnection((prev) => ({ ...prev, password: e.target.value }))} placeholder="Password" className="border border-slate-200 rounded-lg px-3 py-2 text-xs" />
          </div>
        )}
        <div className="text-[10px] text-slate-500 bg-white border border-slate-200 rounded-lg p-2">
          Source files: {sourceFileNames.join(', ') || 'none'}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
        <h3 className="text-xs font-black text-slate-900 flex items-center gap-2"><FileJson className="w-3.5 h-3.5 text-[#e67225]" /> Existing Model Files</h3>
        <label className="flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-lg p-3 text-[11px] font-bold text-slate-500 hover:text-[#e67225] hover:border-[#e67225]/40 cursor-pointer">
          <Upload className="w-3.5 h-3.5" /> Upload existing models
          <input type="file" multiple className="hidden" onChange={(e) => uploadProjectFiles('existing_model', e.target.files, (names) => setExistingModelFiles((prev) => [...prev, ...names]))} />
        </label>
        <div className="text-[10px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-2">
          Existing models: {existingModelFiles.join(', ') || 'none'}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-black text-slate-900 flex items-center gap-2"><BookOpen className="w-3.5 h-3.5 text-[#e67225]" /> Standard Naming Rules</h3>
          <button onClick={() => setIsCreateSkillOpen(true)} className="text-[11px] font-bold text-[#e67225] hover:underline">Create Skill</button>
        </div>
        <select value={standardNamingSkillId} onChange={(e) => { setStandardNamingSkillId(e.target.value); const skill = skills.find((item) => item.id === e.target.value); if (skill) setStandardNamingNotes(`/skill ${skill.name}`); }} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs">
          <option value="">/ select available naming skill</option>
          {skills.map((skill) => <option key={skill.id} value={skill.id}>/skill {skill.name}</option>)}
        </select>
        <textarea value={standardNamingNotes} onChange={(e) => setStandardNamingNotes(e.target.value)} rows={3} placeholder="/skill standard_naming or paste rules here..." className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs resize-none focus:outline-none focus:border-[#e67225]/60" />
        <label className="flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-lg p-3 text-[11px] font-bold text-slate-500 hover:text-[#e67225] hover:border-[#e67225]/40 cursor-pointer">
          <Upload className="w-3.5 h-3.5" /> Upload naming rule files
          <input type="file" multiple className="hidden" onChange={(e) => uploadProjectFiles('standard_naming_skill', e.target.files, (names) => setStandardNamingFiles((prev) => [...prev, ...names]))} />
        </label>
        <div className="text-[10px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-2">
          Naming files: {standardNamingFiles.join(', ') || 'none'}
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden">
      <header className="bg-white border-b border-slate-200 shrink-0 z-40">
        <div className="px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold overflow-x-auto no-scrollbar">
            <button onClick={() => navigate('/dashboard')} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#e67225]/10 text-[#e67225] font-bold hover:bg-[#e67225]/20">
              <Layers className="w-3.5 h-3.5" /> Dashboard
            </button>
            <ChevronRight className="w-3 h-3 text-slate-300" />
            <span className="text-slate-700 font-bold truncate max-w-64">{projectName}</span>
            <ChevronRight className="w-3 h-3 text-slate-300" />
            <span className="text-slate-400">{screen === 'mode' ? 'Mode Selection' : 'Source & Canvas'}</span>
          </div>
          {screen === 'builder' && (
            <button onClick={handleSave} disabled={saving || nodes.length === 0} className="flex items-center gap-1.5 px-3.5 py-2 bg-[#e67225] hover:bg-[#d0621a] disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors">
              {saving ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              Run Pipeline
            </button>
          )}
        </div>
      </header>

      {screen === 'mode' ? (
        <main className="flex-1 overflow-auto flex items-center justify-center">
          <div className="w-full max-w-5xl p-6 space-y-6">
            {error && <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}
            <section className="bg-white border border-slate-200 rounded-2xl p-6">
              <div className="mb-5">
                <h2 className="text-lg font-black text-slate-900">Choose Modeling Mode</h2>
                <p className="text-sm text-slate-500 mt-1">After selecting a mode, you will land on source configuration with the pipeline canvas.</p>
              </div>
              <div className="grid md:grid-cols-3 gap-3">
                {WORKFLOW_MODES.map(({ id: modeId, label, desc, icon: Icon }) => (
                  <button key={modeId} onClick={() => selectMode(modeId)} className="p-5 rounded-2xl border border-slate-200 text-left transition-all hover:border-[#e67225]/50 hover:bg-[#e67225]/5 hover:-translate-y-0.5">
                    <Icon className="w-6 h-6 mb-4 text-[#e67225]" />
                    <div className="text-sm font-black text-slate-900">{label}</div>
                    <p className="text-xs text-slate-500 mt-2 leading-relaxed">{desc}</p>
                    <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-black text-[#e67225]">
                      Select <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </button>
                ))}
              </div>
            </section>
          </div>
        </main>
      ) : (
        <main
          className="flex-1 grid grid-cols-1 overflow-hidden lg:[grid-template-columns:var(--project-config-grid)]"
          style={{ '--project-config-grid': `${leftPanelWidth}px 8px minmax(0,1fr)` } as React.CSSProperties}
        >
          <aside className="bg-white border-r border-slate-200 overflow-y-auto">
            <div className="p-5 space-y-5">
              {error && <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}
              <section className="space-y-3">
                <button onClick={() => setScreen('mode')} className="inline-flex items-center gap-1.5 text-xs font-bold text-[#e67225] hover:underline">
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to modes
                </button>
                <div>
                  <h2 className="text-sm font-black text-slate-900">{WORKFLOW_MODES.find((mode) => mode.id === workflowMode)?.label}</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    {workflowMode === 'default' && 'Default mode uses the fixed 4 approved agents. Configure the source and each node before running.'}
                    {workflowMode === 'custom' && (customBuilderMode === 'orchestrator'
                      ? 'The orchestrator proposes a governed pipeline from your inputs, then pauses for HITL review.'
                      : 'DIY mode lets you drag installed agents onto the canvas and configure every connection yourself.')}
                  </p>
                </div>
              </section>

              <SourceConfigurationPanel />

              {workflowMode === 'custom' && (
                <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black text-slate-900 flex items-center gap-2"><Workflow className="w-3.5 h-3.5 text-[#e67225]" /> Custom Workflow Builder</h3>
                    <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">{customBuilderMode}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => { setCustomBuilderMode('diy'); setError(''); }} className={`rounded-xl border px-3 py-3 text-left ${customBuilderMode === 'diy' ? 'border-[#e67225] bg-orange-50' : 'border-slate-200 bg-slate-50'}`}>
                      <div className="text-xs font-black text-slate-900">DIY Workflow</div>
                      <div className="mt-1 text-[10px] leading-relaxed text-slate-500">Drag installed agents, connect nodes, and configure the pipeline manually.</div>
                    </button>
                    <button onClick={() => { setCustomBuilderMode('orchestrator'); setError(''); }} className={`rounded-xl border px-3 py-3 text-left ${customBuilderMode === 'orchestrator' ? 'border-[#e67225] bg-orange-50' : 'border-slate-200 bg-slate-50'}`}>
                      <div className="text-xs font-black text-slate-900">Orchestrator</div>
                      <div className="mt-1 text-[10px] leading-relaxed text-slate-500">Prompt the planner to assemble agents, skills, edges, and HITL checkpoints.</div>
                    </button>
                  </div>
                </section>
              )}

              {workflowMode === 'custom' && customBuilderMode === 'orchestrator' && (
                <section className="space-y-2 rounded-xl border border-orange-200 bg-orange-50 p-3">
                  <h3 className="text-xs font-black text-orange-900 flex items-center gap-2"><Zap className="w-3.5 h-3.5" /> Orchestrator Builder</h3>
                  <textarea value={orchestratorPrompt} onChange={(e) => setOrchestratorPrompt(e.target.value)} rows={4} placeholder="/dimensional-modeling or /data-vault..." className="w-full border border-orange-200 rounded-xl px-3 py-2 text-xs resize-none focus:outline-none focus:border-[#e67225]/60" />
                  <button onClick={generateOrchestratorPipeline} disabled={planning} className="w-full flex items-center justify-center gap-2 bg-[#e67225] hover:bg-[#d0621a] disabled:opacity-50 text-white font-bold px-3 py-2 rounded-xl text-xs">
                    {planning ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Zap className="w-3.5 h-3.5" />} Generate Pipeline
                  </button>
                </section>
              )}

              {workflowMode === 'default' && (
                <section className="space-y-3 rounded-xl border border-orange-200 bg-orange-50 p-3">
                  <h3 className="text-xs font-black text-orange-900">Standard Default Pipeline</h3>
                  <p className="text-xs text-orange-800">Marketplace agents are disabled for default mode.</p>
                  <div className="space-y-1">
                    {nodes.map((node, index) => (
                      <div key={node.id} className="text-[11px] font-bold text-orange-900 bg-white border border-orange-100 rounded-lg px-2 py-1.5">
                        {index + 1}. {node.data.name}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {workflowMode !== 'default' && (
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black text-slate-700 flex items-center gap-2"><Bot className="w-3.5 h-3.5 text-[#e67225]" /> Agent Marketplace</h3>
                    <button onClick={() => setIsCreateAgentOpen(true)} className="flex items-center gap-1.5 text-[11px] font-bold text-[#e67225] hover:underline">
                      <Plus className="w-3 h-3" /> Create Agent
                    </button>
                  </div>
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {agents.map((agent) => (
                      <div
                        key={agent.id}
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = 'move';
                          event.dataTransfer.setData('application/agent', JSON.stringify(agent));
                        }}
                        className="border border-slate-200 rounded-xl p-3 bg-slate-50/60 cursor-grab active:cursor-grabbing hover:border-[#e67225]/40 hover:bg-orange-50/40 transition-colors"
                        title="Drag this agent onto the canvas"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-xs font-black text-slate-900">{agent.name}</div>
                            <p className="text-[10px] text-slate-500 leading-relaxed">{agent.description}</p>
                            <div className="mt-1 text-[9px] font-black uppercase tracking-wide text-[#e67225]">Drag to canvas</div>
                            <div className="mt-2 flex flex-wrap gap-1">
                              {agent.default_skills.map((skill) => <span key={skill} className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[9px] font-bold text-slate-600">{skill}</span>)}
                              {agent.agent_type === 'remote' && <span className="px-1.5 py-0.5 rounded bg-blue-50 border border-blue-200 text-[9px] font-bold text-blue-700">A2A</span>}
                            </div>
                          </div>
                          <button onClick={() => addAgent(agent)} className="p-1.5 bg-[#e67225] text-white rounded-lg hover:bg-[#d0621a]" title={selectedAgentIds.includes(agent.id) ? 'Add another step' : 'Add agent'}>
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </aside>

          <div
            className="hidden lg:block cursor-col-resize bg-slate-200 transition-colors hover:bg-[#e67225]/40"
            onMouseDown={(event) => {
              event.preventDefault();
              const startX = event.clientX;
              const startWidth = leftPanelWidth;
              const onMove = (moveEvent: MouseEvent) => {
                setLeftPanelWidth(Math.min(680, Math.max(320, startWidth + moveEvent.clientX - startX)));
              };
              const onUp = () => {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
              };
              window.addEventListener('mousemove', onMove);
              window.addEventListener('mouseup', onUp);
            }}
            title="Resize source configuration panel"
          />

          <section className={`relative min-h-0 flex flex-col ${canvasTheme === 'dark' ? 'bg-[#0d1117]' : 'bg-slate-50'}`}>
            <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between gap-3 pointer-events-none">
              <div className={`pointer-events-auto rounded-xl px-3 py-2 shadow-xl border ${canvasTheme === 'dark' ? 'bg-[#161b22]/95 border-[#30363d]' : 'bg-white/95 border-slate-200'}`}>
                <div className={`flex items-center gap-2 text-xs font-bold ${canvasTheme === 'dark' ? 'text-white' : 'text-slate-900'}`}><GitBranch className="w-4 h-4 text-[#e67225]" /> Agent Pipeline Canvas</div>
                <div className={canvasTheme === 'dark' ? 'text-[10px] text-gray-400' : 'text-[10px] text-slate-500'}>Drag agents, connect nodes, and click each node to configure agent behavior.</div>
              </div>
              <div className="pointer-events-auto flex items-center gap-2">
                <button onClick={() => setCanvasTheme((value) => value === 'dark' ? 'light' : 'dark')} className={`p-2 rounded-lg border ${canvasTheme === 'dark' ? 'bg-[#161b22] border-[#30363d] text-gray-300 hover:text-white' : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900'}`} title="Toggle canvas theme">
                  {canvasTheme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>
                {workflowMode !== 'default' && <button onClick={() => { setNodes([]); setEdges([]); }} className={`p-2 rounded-lg border ${canvasTheme === 'dark' ? 'bg-[#161b22] border-[#30363d] text-gray-300 hover:text-rose-400' : 'bg-white border-slate-200 text-slate-600 hover:text-rose-600'}`} title="Clear canvas">
                  <Trash2 className="w-4 h-4" />
                </button>}
                {workflowMode === 'default' && <button onClick={() => setPipelineForMode('default')} className={`px-3 py-2 rounded-lg border text-xs font-bold ${canvasTheme === 'dark' ? 'bg-[#161b22] border-[#30363d] text-gray-300 hover:text-white' : 'bg-white border-slate-200 text-slate-700 hover:text-[#e67225]'}`}>Reset 4 Agents</button>}
              </div>
            </div>

            <WorkflowCanvas initialNodes={nodes} initialEdges={edges} theme={canvasTheme} onChange={(nextNodes, nextEdges) => { setNodes(nextNodes); setEdges(nextEdges); }} />

            <div className={`absolute bottom-4 left-4 right-4 z-20 border rounded-xl p-3 flex items-center justify-between gap-3 ${canvasTheme === 'dark' ? 'bg-[#161b22]/95 border-[#30363d]' : 'bg-white/95 border-slate-200 shadow-xl'}`}>
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                {BUILTIN_SKILLS.map((skill) => <span key={skill} className={`px-2 py-1 rounded-lg border text-[10px] font-bold flex items-center gap-1 ${canvasTheme === 'dark' ? 'bg-[#21262d] border-[#30363d] text-gray-300' : 'bg-orange-50 border-orange-100 text-orange-700'}`}><BookOpen className="w-3 h-3 text-[#e67225]" /> /{skill}</span>)}
              </div>
              <button onClick={handleSave} disabled={saving || nodes.length === 0} className="shrink-0 flex items-center gap-2 px-4 py-2 bg-[#e67225] hover:bg-[#d0621a] disabled:opacity-50 text-white rounded-lg text-xs font-black">
                <Play className="w-4 h-4" /> Run Pipeline <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </section>
        </main>
      )}

      {isCreateSkillOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-[#e67225] px-5 py-4 flex items-center justify-between">
              <div className="text-white font-bold flex items-center gap-2"><BookOpen className="w-4 h-4" /> Create Standard Naming Skill</div>
              <button onClick={() => setIsCreateSkillOpen(false)} className="text-white/80 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <input value={newSkill.name} onChange={(e) => setNewSkill((prev) => ({ ...prev, name: e.target.value }))} placeholder="Skill name, e.g. enterprise_snake_case" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#e67225]/60" />
              <input value={newSkill.description} onChange={(e) => setNewSkill((prev) => ({ ...prev, description: e.target.value }))} placeholder="Short description" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#e67225]/60" />
              <textarea value={newSkill.content} onChange={(e) => setNewSkill((prev) => ({ ...prev, content: e.target.value }))} rows={6} placeholder="Paste naming rules or standards text..." className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-[#e67225]/60" />
              <label className="flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl p-4 text-xs font-bold text-slate-500 hover:text-[#e67225] hover:border-[#e67225]/40 cursor-pointer">
                <Upload className="w-4 h-4" /> Upload any rule file
                <input type="file" multiple className="hidden" onChange={(e) => setNewSkill((prev) => ({ ...prev, files: Array.from(e.target.files ?? []) }))} />
              </label>
              {newSkill.files.length > 0 && <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-3">{newSkill.files.map((file) => file.name).join(', ')}</div>}
              <div className="flex justify-end gap-3">
                <button onClick={() => setIsCreateSkillOpen(false)} className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
                <button onClick={createStandardNamingSkill} className="px-4 py-2 bg-[#e67225] hover:bg-[#d0621a] text-white rounded-xl text-sm font-bold">Create Skill</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isCreateAgentOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-[#e67225] px-5 py-4 flex items-center justify-between">
              <div className="text-white font-bold flex items-center gap-2"><Bot className="w-4 h-4" /> Create Custom Agent</div>
              <button onClick={() => setIsCreateAgentOpen(false)} className="text-white/80 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <input value={newAgent.name} onChange={(e) => setNewAgent((prev) => ({ ...prev, name: e.target.value }))} placeholder="Agent name" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#e67225]/60" />
              <textarea value={newAgent.description} onChange={(e) => setNewAgent((prev) => ({ ...prev, description: e.target.value }))} rows={3} placeholder="Role, inputs, output artifacts, behavior..." className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-[#e67225]/60" />
              <input value={newAgent.defaultSkills} onChange={(e) => setNewAgent((prev) => ({ ...prev, defaultSkills: e.target.value }))} placeholder="/skills comma separated, e.g. dimensional-modeling, sttm" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#e67225]/60" />
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input type="checkbox" checked={newAgent.a2aEnabled} onChange={(e) => setNewAgent((prev) => ({ ...prev, a2aEnabled: e.target.checked }))} />
                Enable A2A remote agent handshake
              </label>
              {newAgent.a2aEnabled && (
                <div className="grid md:grid-cols-2 gap-3 bg-blue-50 border border-blue-100 rounded-xl p-3">
                  <input value={newAgent.remoteUri} onChange={(e) => setNewAgent((prev) => ({ ...prev, remoteUri: e.target.value }))} placeholder="Remote agent run URI" className="border border-blue-200 rounded-lg px-3 py-2 text-xs focus:outline-none" />
                  <input value={newAgent.handshakePath} onChange={(e) => setNewAgent((prev) => ({ ...prev, handshakePath: e.target.value }))} placeholder="Handshake path" className="border border-blue-200 rounded-lg px-3 py-2 text-xs focus:outline-none" />
                  <button onClick={testA2AHandshake} className="md:col-span-2 px-3 py-2 rounded-lg border border-blue-300 bg-white text-blue-700 text-xs font-bold hover:bg-blue-100">Test A2A Handshake</button>
                  {a2aStatus && <div className="md:col-span-2 text-[10px] text-blue-900 bg-white border border-blue-200 rounded-lg px-2 py-1.5">{a2aStatus}</div>}
                </div>
              )}
              <div className="flex justify-end gap-3">
                <button onClick={() => setIsCreateAgentOpen(false)} className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
                <button onClick={createCustomAgent} className="px-4 py-2 bg-[#e67225] hover:bg-[#d0621a] text-white rounded-xl text-sm font-bold">Create & Add</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
