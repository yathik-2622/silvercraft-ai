import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  ChevronRight, Layers, Send, Bot, User, Sparkles, Check,
  CheckCircle2, RefreshCw, Zap, BookOpen, ArrowRight,
  AlertCircle, X, MessageSquare, Copy, Edit3, Trash2, Network, FileText, FileDown
} from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { orchestratorApi, skillsApi, agentsApi, projectsApi } from '../api/client';
import { DualPaneView } from '../components/DualPaneView';
import SkillCreateModal from '../components/SkillCreateModal';
import type {
  HitlStageId, SourceTableProfile, ConceptualConcept, ConceptualRelationship,
  LogicalEntity, LogicalRelationship, PhysicalTable, SttmMappingRow,
  ChatMessage, ModelingSessionConfig, CustomPipelineStep
} from '../types';

const STAGES: { id: HitlStageId; label: string; artifact: string }[] = [
  { id: '1-source-analysis', label: 'Source Analysis', artifact: 'Data Profiler · Dictionary · Classification' },
  { id: '2-conceptual', label: 'Conceptual Model', artifact: 'Concepts · Relationships · Cardinality' },
  { id: '3-logical', label: 'Logical Model', artifact: 'Entities · Attributes · Relationships' },
  { id: '4-physical-sttm', label: 'Physical & STTM', artifact: 'Tables · DDL · STTM Matrix' },
];

export const StudioPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const config = (location.state as any) ?? {};

  const [currentStage, setCurrentStage] = useState<HitlStageId>('1-source-analysis');
  const [isSkillModalOpen, setIsSkillModalOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: 'm-init',
    sender: 'bot',
    text: `✅ **SilverCraft AI Ready** — Project loaded.\n\nStage 1 (Source Analysis) is active. Waiting for source tables to be uploaded or generated.\n\n💡 **Tip:** Use \`/dimensional-modelling\` or \`/data-vault\` to switch modeling skill mid-session. Type \`/skill\` to see all available skills.`,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    suggestedPrompts: ['Analyze source tables', 'Flag PII columns', 'Configure Domain: E-Commerce', 'Review relationships'],
  }]);
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  const [sourceTables, setSourceTables] = useState<SourceTableProfile[]>([]);
  const [concepts, setConcepts] = useState<ConceptualConcept[]>([]);
  const [conceptRelationships, setConceptRelationships] = useState<ConceptualRelationship[]>([]);
  const [logicalEntities, setLogicalEntities] = useState<LogicalEntity[]>([]);
  const [logicalRelationships, setLogicalRelationships] = useState<LogicalRelationship[]>([]);
  const [physicalTables, setPhysicalTables] = useState<PhysicalTable[]>([]);
  const [sttmRows, setSttmRows] = useState<SttmMappingRow[]>([]);
  const [isHistoryCollapsed, setIsHistoryCollapsed] = useState(false);
  const [isKgModalOpen, setIsKgModalOpen] = useState(false);
  const [kgDomain, setKgDomain] = useState(config.domain ?? 'Enterprise Data Modeling');
  const [kgSubDomain, setKgSubDomain] = useState('');
  const [chatThreads, setChatThreads] = useState([
    { id: 'thread-current', title: 'Current modeling run', owner: 'You', updated: 'now' },
    { id: 'thread-copy', title: 'Copy from team baseline', owner: 'You', updated: 'draft' },
  ]);
  const [sessionConfig, setSessionConfig] = useState<ModelingSessionConfig>({
    domain: config.projectName ?? 'E-Commerce & Retail Sales',
    modelingStyle: '3NF',
    implementationMode: 'Greenfield',
    clientConstraints: 'snake_case, ISO timestamps, PII masking',
    standardNamingRule: config.namingRule ?? 'snake_case',
    selectedSourceType: 'CSV',
    targetDialect: 'Databricks Delta',
    globalContext: 'Enterprise Medallion Architecture. Apply governance standards.',
    skillFiles: [],
  });

  const configuredCustomAgents = (config.agents ?? []).map((agent: any) => ({
    id: agent.id,
    name: agent.name,
    role: agent.name,
    description: agent.custom_prompt || 'Configured workflow agent',
    category: 'Custom',
    iconName: 'Bot',
    systemPrompt: agent.custom_prompt || '',
    inputTypes: ['Project Context'],
    outputArtifacts: ['Modeling Artifact'],
    skills: agent.applied_skills ?? agent.default_skills ?? [],
    isPredefined: false,
    rating: 5,
    usageCount: 1,
  }));

  const addBotMessage = (text: string, prompts?: string[]) => {
    const msg: ChatMessage = {
      id: `m-${Date.now()}`,
      sender: 'bot',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      suggestedPrompts: prompts,
    };
    setMessages((prev) => [...prev, msg]);
  };

  const handleSendMessage = async (text: string) => {
    const userMsg: ChatMessage = {
      id: `m-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoadingAi(true);

    try {
      // --- COMMAND INTERCEPTOR ---
      if (text.trim().startsWith('/skill list')) {
        const [custom, builtin] = await Promise.all([
          skillsApi.list(),
          skillsApi.listBuiltin(),
        ]);
        const customSkills = custom.data.map((s: any) => `- **${s.name}**: ${s.description}`).join('\n');
        const builtinSkills = builtin.data.map((s: any) => `- **${s}** (Built-in)`).join('\n');
        
        addBotMessage(`Here are your available skills:\n\n**Custom Skills**\n${customSkills || 'None'}\n\n**Built-in Skills**\n${builtinSkills || 'None'}`);
        setIsLoadingAi(false);
        return;
      }

      if (text.trim() === '/skill create') {
        setIsSkillModalOpen(true);
        setIsLoadingAi(false);
        return;
      }

      if (text.trim().startsWith('/agent list')) {
        const [custom, predefined] = await Promise.all([
          agentsApi.listCustom(),
          agentsApi.listPredefined(),
        ]);
        const customAgents = custom.data.map((a: any) => `- **${a.name}**`).join('\n');
        const predefinedAgents = predefined.data.map((a: any) => `- **${a.name}**`).join('\n');
        
        addBotMessage(`Here are your available agents:\n\n**Custom Agents**\n${customAgents || 'None'}\n\n**Predefined Agents**\n${predefinedAgents || 'None'}`);
        setIsLoadingAi(false);
        return;
      }
      // --- END COMMAND INTERCEPTOR ---
      // Build active skills from config agents
      const agentSkills: string[] = (config.agents ?? []).flatMap((a: any) => a.applied_skills ?? a.default_skills ?? []);
      const remoteUri = (config.agents ?? []).find((a: any) => a.a2a_enabled)?.custom_remote_uri;

      const res = await orchestratorApi.run({
        prompt: text,
        current_stage: currentStage,
        workflow_type: config.workflowMode ?? 'default',
        skills: agentSkills,
        schema_context: {
          tables: sourceTables.map((t) => t.tableName),
          concepts: concepts.map((c) => c.name),
          logicalEntities: logicalEntities.map((e) => e.name),
        },
        messages: messages.map((m) => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.text })),
        ...(remoteUri ? { remote_agent_uri: remoteUri } : {}),
      });

      setIsLoadingAi(false);
      const data = res.data;

      if (data.suggested_workflow) {
        addBotMessage(
          `${data.reply}\n\n🔀 **Orchestrator suggested workflow:**\n${data.suggested_workflow.map((s: string, i: number) => `${i + 1}. \`${s}\``).join('\n')}`,
          ['Approve suggested workflow', 'Modify agents', 'Start pipeline'],
        );
      } else {
        addBotMessage(data.reply, ['Approve & Proceed', 'Add constraint', 'Show DDL']);
      }
    } catch (err: any) {
      setIsLoadingAi(false);
      addBotMessage(`❌ Error from orchestrator: ${err.message || 'Failed to connect to the backend'}`);
    }
  };

  const handleAdvanceStage = () => {
    const map: Record<HitlStageId, HitlStageId | null> = {
      '1-source-analysis': '2-conceptual',
      '2-conceptual': '3-logical',
      '3-logical': '4-physical-sttm',
      '4-physical-sttm': null,
    };
    const next = map[currentStage];
    if (next) {
      setCurrentStage(next);
      const stage = STAGES.find((s) => s.id === next);
      addBotMessage(`✅ **Stage approved!** Advanced to **${stage?.label}**.\n\nArtifacts: _${stage?.artifact}_\n\nReview the canvas and make any adjustments before proceeding.`);
    } else {
      addBotMessage('🎉 **All 4 stages complete!** All modeling artifacts are ready for export. Click **Export All** to download.');
    }
  };

  const exportPayload = () => ({
    sourceTables,
    concepts,
    conceptRelationships,
    logicalEntities,
    logicalRelationships,
    physicalTables,
    sttmRows,
    messages,
    agents: config.agents ?? [],
  });

  const handleExportFormat = async (format: 'pdf' | 'docx' | 'md') => {
    if (!id) return;
    try {
      const res = await projectsApi.exportArtifacts(id, format, {
        project_name: config.projectName ?? 'Project',
        chat_title: 'Current Modeling Run',
        format,
        payload: exportPayload(),
      });
      const contentType = String(res.headers['content-type'] || 'application/octet-stream');
      const blob = new Blob([res.data], { type: contentType });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${(config.projectName ?? 'Project').replace(/\s+/g, '_')}_Current_Modeling_Run.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      addBotMessage(`Exported ${format.toUpperCase()} artifact package.`);
    } catch (err: any) {
      addBotMessage(`Export failed: ${err.response?.data?.detail || err.message || 'Unable to export artifacts'}`);
    }
  };

  const handlePushKg = async () => {
    if (!id) return;
    try {
      const res = await projectsApi.pushKnowledgeGraph(id, {
        domain: kgDomain,
        sub_domain: kgSubDomain,
        chat_id: 'current',
        payload: exportPayload(),
      });
      addBotMessage(`Knowledge Graph created with ${res.data.nodes} nodes and ${res.data.edges} edges for "${kgDomain}".`);
      setIsKgModalOpen(false);
    } catch (err: any) {
      addBotMessage(`Knowledge Graph push failed: ${err.response?.data?.detail || err.message || 'Unable to persist graph'}`);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden">
      {/* Studio Topbar */}
      <header className="bg-white border-b border-slate-200 shrink-0 z-40">
        <div className="px-4 h-12 flex items-center justify-between gap-3">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-xs font-semibold overflow-x-auto no-scrollbar shrink-0">
            <button onClick={() => navigate('/dashboard')} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#e67225]/10 text-[#e67225] font-bold hover:bg-[#e67225]/20 transition-colors">
              <Layers className="w-3.5 h-3.5" /> Home
            </button>
            <ChevronRight className="w-3 h-3 text-slate-300" />
            <span className="text-slate-600 text-xs font-semibold truncate max-w-32">{config.projectName ?? 'Project'}</span>
            <ChevronRight className="w-3 h-3 text-slate-300" />
            {/* Stage Pills */}
            {STAGES.map((s) => (
              <button
                key={s.id}
                onClick={() => setCurrentStage(s.id)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
                  currentStage === s.id
                    ? 'bg-[#e67225] text-white'
                    : STAGES.findIndex((x) => x.id === currentStage) > STAGES.findIndex((x) => x.id === s.id)
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                {currentStage === s.id && <Sparkles className="w-3 h-3 inline mr-1" />}
                {STAGES.findIndex((x) => x.id === currentStage) > STAGES.findIndex((x) => x.id === s.id) && <Check className="w-3 h-3 inline mr-1" />}
                {s.label}
              </button>
            ))}
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => handleExportFormat('pdf')} className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
              <FileDown className="w-3.5 h-3.5" /> PDF
            </button>
            <button onClick={() => handleExportFormat('docx')} className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
              <FileText className="w-3.5 h-3.5" /> DOCX
            </button>
            <button onClick={() => handleExportFormat('md')} className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
              <FileText className="w-3.5 h-3.5" /> MD
            </button>
            <button onClick={() => setIsKgModalOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-colors">
              <Network className="w-3.5 h-3.5" /> Push KG
            </button>
            <button
              onClick={handleAdvanceStage}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#e67225] hover:bg-[#d0621a] text-white rounded-lg text-xs font-bold transition-colors"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Approve & Advance
            </button>
            <div className="w-6 h-6 bg-[#e67225] rounded-full flex items-center justify-center text-white text-[10px] font-bold">
              {user?.full_name?.charAt(0) ?? 'U'}
            </div>
          </div>
        </div>
      </header>

      {/* Main Canvas */}
      <main className="flex-1 overflow-hidden flex">
        <aside className={`${isHistoryCollapsed ? 'w-12' : 'w-64'} bg-white border-r border-slate-200 shrink-0 transition-all overflow-hidden`}>
          <div className="h-full flex flex-col">
            <div className="h-11 border-b border-slate-200 flex items-center justify-between px-3">
              {!isHistoryCollapsed && <span className="text-xs font-black text-slate-800 flex items-center gap-2"><MessageSquare className="w-4 h-4 text-[#e67225]" /> Chat History</span>}
              <button onClick={() => setIsHistoryCollapsed((v) => !v)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100">
                <ChevronRight className={`w-4 h-4 transition-transform ${isHistoryCollapsed ? '' : 'rotate-180'}`} />
              </button>
            </div>
            {!isHistoryCollapsed && (
              <div className="p-3 space-y-2 overflow-auto">
                <button
                  onClick={() => setChatThreads((prev) => [{ id: `thread-${Date.now()}`, title: 'Copied modeling chat', owner: 'You', updated: 'now' }, ...prev])}
                  className="w-full flex items-center justify-center gap-2 bg-[#e67225] hover:bg-[#d0621a] text-white text-xs font-bold rounded-lg py-2"
                >
                  <Copy className="w-3.5 h-3.5" /> Copy This Chat
                </button>
                {chatThreads.map((thread) => (
                  <div key={thread.id} className="group border border-slate-200 rounded-xl p-3 bg-slate-50/70 hover:bg-white">
                    <div className="text-xs font-bold text-slate-800 line-clamp-1">{thread.title}</div>
                    <div className="text-[10px] text-slate-500 mt-1">Owner: {thread.owner} · {thread.updated}</div>
                    <div className="mt-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="p-1 rounded text-slate-400 hover:text-slate-800 hover:bg-slate-100" title="Edit chat name"><Edit3 className="w-3 h-3" /></button>
                      <button onClick={() => setChatThreads((prev) => prev.filter((item) => item.id !== thread.id))} className="p-1 rounded text-slate-400 hover:text-rose-700 hover:bg-rose-50" title="Delete your chat"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  </div>
                ))}
                <div className="text-[10px] text-slate-500 bg-orange-50 border border-orange-200 rounded-xl p-2">
                  Team members can access project artifacts, then copy a chat to create their own modeling run. Chat edit/delete stays with the chat owner.
                </div>
              </div>
            )}
          </div>
        </aside>
        <DualPaneView
          currentStage={currentStage}
          sessionConfig={sessionConfig}
          messages={messages}
          sourceTables={sourceTables}
          concepts={concepts}
          conceptRelationships={conceptRelationships}
          logicalEntities={logicalEntities}
          logicalRelationships={logicalRelationships}
          physicalTables={physicalTables}
          sttmRows={sttmRows}
          isLoadingAi={isLoadingAi}
          workflowType={config.workflowMode === 'custom' ? 'custom' : 'default'}
          pipelineSteps={config.pipelineSteps ?? []}
          customAgents={configuredCustomAgents}
          onSendMessage={handleSendMessage}
          onUpdateSessionConfig={setSessionConfig}
          onAdvanceStage={handleAdvanceStage}
          onStageChange={setCurrentStage}
          onUpdateSourceTables={setSourceTables}
          onUpdateConcepts={setConcepts}
          onUpdateConceptRels={setConceptRelationships}
          onUpdateLogicalEntities={setLogicalEntities}
          onUpdateLogicalRels={setLogicalRelationships}
          onUpdatePhysicalTables={setPhysicalTables}
          onUpdateSttmRows={setSttmRows}
          onUpdateDialect={(d) => setSessionConfig((p) => ({ ...p, targetDialect: d }))}
        />
      </main>

      <SkillCreateModal
        isOpen={isSkillModalOpen}
        onClose={() => setIsSkillModalOpen(false)}
        onCreate={async (name, desc, pastedContent, files) => {
          const fileContents = await Promise.all(files.map(async (file) => `\n\n## ${file.name}\n${await file.text()}`));
          const content = [pastedContent.trim(), ...fileContents].filter(Boolean).join('\n');
          if (!content.trim()) {
            addBotMessage(`Skill **${name}** was not created because no skill content was provided.`);
            return;
          }
          await skillsApi.create(name, desc, content);
          addBotMessage(`Successfully created skill **${name}**.`);
        }}
      />

      {isKgModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="bg-[#e67225] px-5 py-4 flex items-center justify-between">
              <div className="text-white font-bold flex items-center gap-2"><Network className="w-4 h-4" /> Push Modeling Run to Knowledge Graph</div>
              <button onClick={() => setIsKgModalOpen(false)} className="text-white/80 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <input value={kgDomain} onChange={(e) => setKgDomain(e.target.value)} placeholder="Domain" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#e67225]/60" />
              <input value={kgSubDomain} onChange={(e) => setKgSubDomain(e.target.value)} placeholder="Sub-domain / product area" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#e67225]/60" />
              <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-3">
                This will create KG nodes for domain, source systems, concepts, entities, tables, columns, transformations, DQ rules, skills and agents, plus edges for ownership, lineage, relationships and agent-generated artifacts.
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setIsKgModalOpen(false)} className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
                <button onClick={handlePushKg} className="px-4 py-2 bg-[#e67225] hover:bg-[#d0621a] text-white rounded-xl text-sm font-bold">Create KG Nodes & Edges</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
