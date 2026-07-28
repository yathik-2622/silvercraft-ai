import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bot, BrainCircuit, ChevronDown, ChevronLeft, ChevronRight, Copy, Database, FileText, FileUp, GitBranch, Layers, LoaderCircle, PanelRightClose, PanelRightOpen, Pencil, Plus, RotateCcw, Search, Send, Sparkles, Table2, Trash2, X } from 'lucide-react';
import { artifactsApi, orchestratorApi, projectsApi, sessionsApi, settingsApi, skillsApi, workflowsApi } from '../api/client';
import { FollowUpActions } from '../components/studio/FollowUpActions';
import { IconButton } from '../components/studio/IconButton';
import { StructuredCanvas } from '../components/studio/StructuredCanvas';

type Message = { id: string; sender: 'user' | 'assistant' | 'system'; text: string; stage?: string; eventType?: string };
type Artifact = { id: string; title: string; stage: string; content: string; status: 'awaiting_hitl' | 'approved' };
type Chat = { id: string; title: string; updated_at?: string };
type Skill = { id: string; name: string; description: string; content: string };
type Model = { id?: string; value?: string; name?: string; label?: string };
const stages = [{ id: '1-source-analysis', label: 'Source Analysis' }, { id: '2-conceptual', label: 'Conceptual Modeling' }, { id: '3-logical', label: 'Logical Modeling' }, { id: '4-physical-sttm', label: 'Physical Data Modeling' }];

export const StudioPage: React.FC = () => {
  const { id: projectId = '' } = useParams<{ id: string }>(); 
  const navigate = useNavigate(); 
  const uploadRef = useRef<HTMLInputElement>(null); 
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const [project, setProject] = useState<any>(null); 
  const [workflowId, setWorkflowId] = useState(''); 
  const [chatId, setChatId] = useState(''); 
  const [chats, setChats] = useState<Chat[]>([]); 
  const [messages, setMessages] = useState<Message[]>([]); 
  const [skills, setSkills] = useState<Skill[]>([]); 
  const [models, setModels] = useState<Model[]>([]); 
  const [model, setModel] = useState('');
  const [prompt, setPrompt] = useState(''); 
  const [busy, setBusy] = useState(false); 
  const [activity, setActivity] = useState<string[]>([]);
  const [historyOpen, setHistoryOpen] = useState(true); 
  const [search, setSearch] = useState(''); 
  const [view, setView] = useState<'erd' | 'attributes' | 'sttm'>('attributes');
  const [artifacts, setArtifacts] = useState<Artifact[]>([]); 
  const [expanded, setExpanded] = useState<string[]>([]); 
  const [skillOpen, setSkillOpen] = useState(false); 
  const [activeSkill, setActiveSkill] = useState<Skill | null>(null);
  const [attachments, setAttachments] = useState<{ id: string; name: string }[]>([]); 
  const [canvasOpen, setCanvasOpen] = useState(true);
  const [canvasWidth, setCanvasWidth] = useState(520);
  const [error, setError] = useState(''); 
  const [showConnection, setShowConnection] = useState(false); 
  const [connection, setConnection] = useState({ provider: 'PostgreSQL', host: '', database: '', username: '', password: '' });
  const [chatToRename, setChatToRename] = useState<Chat | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [chatToDelete, setChatToDelete] = useState<Chat | null>(null);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [showReasoning, setShowReasoning] = useState(false);
  const [reasoningSteps, setReasoningSteps] = useState<Array<{ id: string; type: string; title: string; detail?: string; agent?: string; tool?: string; timestamp: string }>>([]);
  
  const greeting = useMemo(() => {
    const greetings = [
      { title: "Design your data foundation.", subtitle: "Bring in a source, describe the outcome, and I'll prepare a dimensional model." },
      { title: "Let's model your data.", subtitle: "Upload a schema or describe your business process to start building entities." },
      { title: "Architect your next data product.", subtitle: "From source analysis to physical DDL, I'm here to assist you at every stage." },
      { title: "Ready to map your business?", subtitle: "Describe your entities and relationships, and I'll generate the target state." }
    ];
    const questions = [
      ['Explain the difference between a foundation and product layer.', 'Profile my customer and order sources.', 'Apply standard naming rules from ADM V1.', 'Create a dimensional model for retail orders.'],
      ['What is the difference between a foundation layer and a product layer in SilverCraft AI?', 'Can you profile my customer and order source files?', 'How do I apply standard ADM V1 naming conventions?', 'Build a Kimball-style dimensional model for a retail orders dataset.'],
      ['Describe the foundation vs product layer distinction in data modeling.', 'Run a source analysis on my customer and order data.', 'Enforce ADM V1 naming standards on my logical model.', 'Generate a complete retail dimensional model with facts and dimensions.'],
      ['When should I use foundation layer vs product layer?', 'Profile my uploaded customer and order tables.', 'Apply ADM V1 naming rules to my entities.', 'Create a full dimensional model for online retail orders.'],
    ];
    const index = chatId ? parseInt(chatId.substring(chatId.length - 4), 16) % 4 : 0;
    return { greeting: greetings[index], starters: questions[index] };
  }, [chatId]);
  
  // A normal reply remains in the transcript. The canvas exists only after a
  // specialist returns a reviewable modeling artifact.
  const canvasAvailable = artifacts.length > 0;
  const visibleChats = useMemo(() => chats.filter((chat) => chat.title.toLowerCase().includes(search.toLowerCase())), [chats, search]); 
  const selectedModel = model || models[0]?.value || models[0]?.id || '';
  const composerRows = Math.max(1, Math.min(5, Math.ceil(prompt.length / 90) + prompt.split('\n').length - 1));
  
  const persist = (id: string, sender: Message['sender'], text: string, stage = stages[0].id) => sessionsApi.appendMessage(id, { sender, text, stage });
  const openChat = async (id: string) => { 
    setIsChatLoading(true);
    try {
      const [response, artifactResponse] = await Promise.all([sessionsApi.getChat(id), artifactsApi.list(id)]);
      setChatId(id); 
      setMessages(response.data.messages ?? []); 
      setAttachments((response.data.attachments ?? []).map((file: any) => ({ id: file.file_id, name: file.filename })));
      setArtifacts((artifactResponse.data ?? []).map((artifact: any) => ({ id: artifact.id, title: artifact.title, stage: artifact.stage, content: artifact.content, status: artifact.status })));
      setExpanded([...new Set((artifactResponse.data ?? []).map((artifact: any) => artifact.stage))] as string[]);
    } finally {
      setIsChatLoading(false);
    }
  };
  const refreshChats = async (preferred = '') => { 
    const response = await sessionsApi.listChats(projectId); 
    setChats(response.data ?? []); 
    const id = preferred || response.data?.[0]?.id; 
    if (id) await openChat(id); 
  };
  
  useEffect(() => { 
    if (!projectId) return; 
    const load = async () => { 
      setIsAppLoading(true);
      try { 
        const [projectResponse, flows, availableSkills, modelResponse] = await Promise.all([projectsApi.get(projectId), workflowsApi.listForProject(projectId), skillsApi.list(), settingsApi.discoverModels()]); 
        setProject(projectResponse.data); 
        setSkills(availableSkills.data ?? []); 
        const options = modelResponse.data.models ?? []; 
        setModels(options); 
        setModel(modelResponse.data.default ?? options[0]?.value ?? options[0]?.id ?? ''); 
        let id = flows.data?.[0]?.id; 
        if (!id) id = (await workflowsApi.create({ project_id: projectId, name: `${projectResponse.data.name} orchestration`, workflow_type: 'orchestrator', description: 'Chat-first modeling', status: 'draft' })).data.id; 
        setWorkflowId(id); 
        const savedChats = await sessionsApi.listChats(projectId); 
        if (savedChats.data?.length) await refreshChats(savedChats.data[0].id); 
        else { 
          const chat = await sessionsApi.createChat(projectId, 'Modeling conversation', id); 
          const welcome = 'Hello \u2014 I can answer general questions here, or delegate modeling work when you are ready.'; 
          await persist(chat.data.id, 'assistant', welcome); 
          setChats([chat.data]); 
          setChatId(chat.data.id); 
          setMessages([{ id: 'welcome', sender: 'assistant', text: welcome }]); 
        } 
      } catch (e: any) { 
        setError(e.response?.data?.detail || 'Unable to open the copilot.'); 
      } finally {
        setIsAppLoading(false);
      }
    }; 
    void load(); 
  }, [projectId]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages.length, busy]);
  
  useEffect(() => {
    const onMove = (event: PointerEvent) => setCanvasWidth(Math.min(900, Math.max(360, window.innerWidth - event.clientX)));
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    const startResize = () => {
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    };
    window.addEventListener('adm:canvas-resize', startResize);
    return () => {
      window.removeEventListener('adm:canvas-resize', startResize);
      onUp();
    };
  }, []);
  
  const sendPrompt = async (stageOverride?: string, overrideText?: string) => { 
    const text = (overrideText ?? prompt).trim(); 
    if (!text && !activeSkill) return; 
    const stage = stageOverride || artifacts.at(-1)?.stage || stages[0].id; 
    setPrompt(''); 
    setSkillOpen(false); 
    setBusy(true); 
    setActivity(['Preparing your modeling request']);
    
    const textToSend = activeSkill ? `/${activeSkill.name} ${text}` : text;
    const textToDisplay = activeSkill ? `Used /${activeSkill.name} skill\n${text}` : text;

    setMessages((items) => [...items, { id: `user-${Date.now()}`, sender: 'user', text: textToDisplay, stage }]); 
    setActiveSkill(null);

    try { 
      await persist(chatId, 'user', textToSend, stage); 
      if (textToSend === '/' || textToSend.startsWith('/skill')) { 
        const preview = skills.map((skill) => `/${skill.name} \u2014 ${skill.description}\n${skill.content}`).join('\n\n'); 
        setMessages((items) => [...items, { id: `skills-${Date.now()}`, sender: 'assistant', text: preview || 'No industry skills available.', stage }]); 
        await persist(chatId, 'assistant', preview || 'No industry skills available.', stage); 
        return; 
      } 
      let result: any = null;
      for await (const event of orchestratorApi.stream({ prompt: textToSend, current_stage: stage, workflow_type: 'orchestrator', skills: skills.map((skill) => skill.name), project_id: projectId, workflow_id: workflowId, chat_id: chatId, model_name: selectedModel, schema_context: { project: project?.name, domain: project?.domain, subdomain: project?.sub_domain, attachments: attachments.map((item) => item.name), source_file_ids: attachments.map((item) => item.id), source_connection: project?.source_connects, artifacts } })) {
        if (event.event === 'activity') {
          setActivity((items) => [...items, event.data.label || event.data.summary || 'Agent activity updated']);
          setReasoningSteps((items) => [...items, { id: `reasoning-${Date.now()}-${Math.random()}`, type: 'activity', title: event.data.label || event.data.summary || 'Agent activity updated', detail: event.data.status, timestamp: new Date().toISOString() }]);
        }
        if (['thinking', 'tool_call', 'peer_call', 'gate_ready'].includes(event.event)) {
          let text = '';
          let detail: string | undefined;
          if (event.event === 'thinking') { text = `${event.data.step ? `[${event.data.step}] ` : ''}${event.data.label || event.data.thought || 'Processing...'}`; detail = event.data.thought || event.data.label; }
          if (event.event === 'tool_call') { text = `Using tool: ${event.data.tool_name || 'unknown'}`; detail = event.data.tool_name; }
          if (event.event === 'peer_call') { text = `Delegating to peer: ${event.data.agent_name || 'unknown'}`; detail = event.data.agent_name; }
          if (event.event === 'gate_ready') { text = `Gate ready: ${event.data.gate || 'unknown'}`; detail = event.data.gate; }
          setMessages((items) => [...items, { 
            id: `event-${Date.now()}-${Math.random()}`, 
            sender: 'system', 
            text, 
            timestamp: new Date().toISOString(), 
            eventType: event.event, 
            agentName: event.data.agent_name 
          }]);
          setReasoningSteps((items) => [...items, { 
            id: `reasoning-${Date.now()}-${Math.random()}`, 
            type: event.event, 
            title: text, 
            detail, 
            agent: event.data.agent_name, 
            tool: event.data.tool_name, 
            timestamp: new Date().toISOString() 
          }]);
        }
        if (event.event === 'started') {
          setReasoningSteps((items) => [...items, { id: `reasoning-${Date.now()}-${Math.random()}`, type: 'started', title: 'Orchestration started', detail: event.data.message, timestamp: new Date().toISOString() }]);
        }
        if (event.event === 'completed') {
          setReasoningSteps((items) => [...items, { id: `reasoning-${Date.now()}-${Math.random()}`, type: 'completed', title: 'Stage completed', detail: event.data.summary || event.data.message, agent: event.data.agent_name, timestamp: new Date().toISOString() }]);
        }
        if (event.event === 'error') throw new Error(event.data.detail || event.data.message || 'The orchestration stream failed.');
        if (event.event === 'result') result = event.data;
      }
      if (!result) throw new Error('The orchestration stream ended without a result.');
      const artifact = result.artifact;
      if (artifact) { 
        const next = { id: `artifact-${Date.now()}`, title: artifact.title, stage: artifact.stage || stage, content: artifact.content, status: 'awaiting_hitl' as const }; 
        const saved = await artifactsApi.create(chatId, { title: next.title, stage: next.stage, content: next.content, agent_name: artifact.title });
        next.id = saved.data.id;
        setArtifacts((items) => [...items, next]); 
        setExpanded((items) => [...new Set([...items, next.stage])]); 
        setCanvasOpen(true);
        const notice = `${stages.find((item) => item.id === next.stage)?.label || 'Modeling'} output is ready in the canvas for review.`; 
        setMessages((items) => [...items, { id: `ready-${Date.now()}`, sender: 'assistant', text: notice, stage }]); 
        await persist(chatId, 'assistant', notice, stage); 
      } else { 
        const reply = result.reply || 'I am ready to help.';
        setMessages((items) => [...items, { id: `assistant-${Date.now()}`, sender: 'assistant', text: reply, stage }]); 
        await persist(chatId, 'assistant', reply, stage); 
      } 
      if (result.chat_title) {
        setChats((items) => items.map((chat) => chat.id === chatId ? { ...chat, title: result.chat_title } : chat));
      }
    } catch (e: any) { 
      setMessages((items) => [...items, { id: `error-${Date.now()}`, sender: 'system', text: e.response?.data?.detail || 'The orchestration request failed.' }]); 
    } finally { 
      setBusy(false); 
      setActivity([]);
      setReasoningSteps([]);
    } 
  };
  
  const createChat = async () => { 
    const response = await sessionsApi.createChat(projectId, 'New modeling conversation', workflowId); 
    setChats((items) => [response.data, ...items]); 
    setChatId(response.data.id); 
    setMessages([]); 
    setAttachments([]); 
    setArtifacts([]); 
  };
  const renameChat = (chat: Chat) => { 
    setChatToRename(chat);
    setRenameValue(chat.title);
  };
  const executeRename = async () => {
    if (!chatToRename || !renameValue.trim()) return;
    await sessionsApi.renameChat(chatToRename.id, renameValue.trim()); 
    await refreshChats(chatToRename.id);
    setChatToRename(null);
  };
  const removeChat = (chat: Chat) => setChatToDelete(chat);
  const executeDelete = async () => {
    if (!chatToDelete) return;
    await sessionsApi.deleteChat(chatToDelete.id); 
    await refreshChats();
    setChatToDelete(null);
  };
  const upload = async (files: FileList | null) => { 
    if (!files?.length) return; 
    try { 
      const response = await projectsApi.uploadFiles(projectId, 'chat_source', Array.from(files)); 
      const uploaded = response.data.map((file: any) => ({ id: file.id, name: file.filename, contentType: file.content_type, size: file.size }));
      
      // Phase 7: Poll until parsing is complete
      for (const file of uploaded) {
        setActivity((items) => [...items, `Parsing ${file.name}...`]);
        let status = 'processing';
        while (status === 'processing' || status === 'pending') {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          const res = await projectsApi.getFileStatus(projectId, file.id);
          status = res.data.parse_status;
          if (status === 'failed') throw new Error(`Parsing failed for ${file.name}`);
        }
      }

      await Promise.all(uploaded.map((file: any) => sessionsApi.attachFile(chatId, file.id, file.name, file.contentType, file.size)));
      setAttachments((items) => [...items, ...uploaded.map((file: any) => ({ id: file.id, name: file.name }))]); 
      setActivity([]);
    } catch (e: any) { 
      setError(e.message || 'File upload failed.'); 
      setActivity([]);
    } 
  };
  const saveConnection = async (event: React.FormEvent) => { 
    event.preventDefault(); 
    await projectsApi.update(projectId, { source_connects: { type: 'database', provider: connection.provider, host: connection.host, database: connection.database, username: connection.username, password_masked: Boolean(connection.password) } }); 
    setShowConnection(false); 
    setPrompt(`I requested a ${connection.provider} connection for ${connection.database}. Ask for table scope, then continue source analysis.`); 
  };
  const updateArtifact = (artifact: Artifact, content: string) => setArtifacts((items) => items.map((item) => item.id === artifact.id ? { ...item, content } : item)); 
  const approve = async (artifact: Artifact) => { 
    if (artifact.id.startsWith('artifact-')) throw new Error('Artifact has not been persisted yet.');
    await artifactsApi.updateStatus(artifact.id, 'approved', 'Approved from canvas.');
    await sessionsApi.decideHitl(workflowId, artifact.stage, { decision: 'approved', comment: 'Approved from canvas.', artifact }); 
    setArtifacts((items) => items.map((item) => item.id === artifact.id ? { ...item, status: 'approved' } : item)); 
  };
  const startCanvasResize = () => window.dispatchEvent(new Event('adm:canvas-resize'));

  const canvas = (
    <motion.section initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} className="relative flex min-w-0 min-h-0 flex-col border-l border-slate-200 bg-white/60 backdrop-blur-xl">
      <div onPointerDown={startCanvasResize} className="absolute -left-1 top-0 z-20 h-full w-2 cursor-col-resize touch-none" aria-label="Resize canvas" role="separator" />
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div>
          <div className="text-sm font-black text-slate-900">
            <GitBranch className="mr-1.5 inline h-4 w-4 text-[#e67225]" />
            Agent canvas
          </div>
          <p className="mt-1 text-xs text-slate-500">Delegated modeling work and HITL review.</p>
        </div>
        <div className="flex items-center gap-2">
          {!busy && (
          <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1">
            {[['erd', 'ERD', GitBranch], ['attributes', 'Attributes', Table2], ['sttm', 'STTM / DDL', FileText]].map(([key, label, Icon]: any) => (
              <button key={key} onClick={() => setView(key)} className={`rounded-md px-2 py-1 text-[10px] font-bold transition ${view === key ? 'bg-[#e67225] text-white shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>
                <Icon className="mr-1 inline h-3.5 w-3.5" />{label}
              </button>
            ))}
          </div>
          )}
          <IconButton label="Close agent canvas" onClick={() => setCanvasOpen(false)}><PanelRightClose className="h-4 w-4" /></IconButton>
        </div>
      </div>
      {busy ? (
        <div className="grid flex-1 place-items-center p-8">
          <div className="w-full max-w-sm rounded-3xl border border-[#e67225]/30 bg-white/80 p-6 shadow-[0_0_40px_rgba(230,114,37,0.15)] backdrop-blur-md">
            <div className="flex items-center gap-2 text-sm font-black text-slate-900">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#e67225]" />
              Orchestrator working
            </div>
            <div className="mt-5 space-y-4">
              {['Master understands the request', 'Skills and context are attached', 'Specialist prepares reviewable output'].map((item, index) => (
                <div key={item} className="flex items-center gap-3 text-xs text-slate-500">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-[#e67225]/10 font-bold text-[#e67225] border border-[#e67225]/20">
                    {index + 1}
                  </span>
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : artifacts.length > 0 ? (
        <StructuredCanvas key={`${artifacts.at(-1)?.id || 'empty'}-${view}`} artifact={artifacts.at(-1)} view={view} onSave={(content) => {
          const artifact = artifacts.at(-1);
          if (!artifact) return;
          updateArtifact(artifact, content);
          if (!artifact.id.startsWith('artifact-')) void artifactsApi.update(artifact.id, content);
        }} />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {stages.map((stage) => { 
            const items = artifacts.filter((item) => item.stage === stage.id); 
            const open = expanded.includes(stage.id); 
            return (
              <section key={stage.id} className="mb-3 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <button onClick={() => setExpanded((current) => open ? current.filter((id) => id !== stage.id) : [...current, stage.id])} className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-slate-50">
                  <span className="text-xs font-black text-slate-900">{stage.label}</span>
                  <span className="flex gap-2 text-[10px] text-slate-500">
                    {items.length} outputs 
                    <ChevronDown className={`h-4 w-4 transition duration-300 ${open ? 'rotate-180' : ''}`} />
                  </span>
                </button>
                {open && (
                  <div className="border-t border-slate-200 bg-slate-50/70 p-3">
                    <input onKeyDown={(e) => { if (e.key === 'Enter') { void sendPrompt(stage.id, (e.target as HTMLInputElement).value); (e.target as HTMLInputElement).value = ''; } }} placeholder={`Ask ${stage.label} agent…`} className="mb-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 placeholder-slate-500 outline-none focus:border-[#e67225]/50 focus:bg-slate-100" />
                    {items.map((artifact) => (
                      <div key={artifact.id} className="mb-3 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
                        <div className="flex justify-between text-xs font-black">
                          <span className="text-slate-900">{artifact.title}</span>
                          <span className={artifact.status === 'approved' ? 'text-emerald-400' : 'text-[#e67225]'}>{artifact.status === 'approved' ? 'Approved' : 'HITL review'}</span>
                        </div>
                        <div className="prose prose-sm mt-3 max-w-none overflow-x-auto rounded-lg border border-slate-100 bg-slate-50/70 p-3 text-slate-700 prose-table:text-xs prose-th:text-left prose-td:whitespace-nowrap">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{artifact.content}</ReactMarkdown>
                        </div>
                        <textarea value={artifact.content} onChange={(e) => updateArtifact(artifact, e.target.value)} onBlur={(e) => { if (!artifact.id.startsWith('artifact-')) void artifactsApi.update(artifact.id, e.target.value); }} className="mt-2 min-h-32 w-full rounded-lg border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-700 outline-none focus:border-[#e67225]/50" />
                        <button disabled={artifact.status === 'approved'} onClick={() => void approve(artifact)} className="mt-3 rounded-lg bg-[#e67225] px-4 py-2 text-[11px] font-bold text-slate-900 transition hover:bg-[#cf5e19] disabled:opacity-50">Approve HITL output</button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ); 
          })}
        </div>
      )}
    </motion.section>
  );

  if (isAppLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="relative flex h-16 w-16 items-center justify-center">
            <div className="absolute inset-0 animate-ping rounded-full bg-[#e67225]/20" />
            <div className="absolute inset-2 animate-spin rounded-full border-4 border-[#e67225] border-t-transparent" />
            <Layers className="h-5 w-5 text-[#e67225]" />
          </div>
          <div className="text-xs font-bold uppercase tracking-widest text-slate-500">Initializing ADM Studio...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-slate-50 text-slate-800 font-sans selection:bg-[#e67225]/30">
      {/* Background ambient glow */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-[#e67225]/10 blur-[120px]" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-500/10 blur-[120px]" />
      </div>

      <header className="relative z-10 flex h-14 items-center justify-between border-b border-slate-200 bg-slate-50/80 px-5 backdrop-blur-xl">
        <button onClick={() => navigate('/dashboard')} className="inline-flex items-center gap-1 text-xs font-black text-slate-500 hover:text-[#e67225] transition">
          <ChevronLeft className="h-4 w-4" />Projects
        </button>
        <div className="text-center">
          <div className="text-sm font-black text-slate-900">{project?.name || 'Modeling copilot'}</div>
          <div className="text-[10px] font-bold text-slate-500">{project?.domain}{project?.sub_domain ? ` / ${project.sub_domain}` : ''}</div>
        </div>
        <div className="flex items-center gap-2">
          <IconButton label="Toggle reasoning" onClick={() => setShowReasoning((value) => !value)}>
            <BrainCircuit className="h-4 w-4" />
          </IconButton>
          <div className="w-16" />
        </div>
      </header>
      
      <main
        className="relative z-10 grid h-[calc(100vh-56px)] min-h-0 transition-[grid-template-columns] duration-300"
        style={{ gridTemplateColumns: `${historyOpen ? 290 : 72}px minmax(0, 1fr)${canvasAvailable && canvasOpen ? ` ${canvasWidth}px` : ''}` }}
      >
        <aside className="flex min-w-0 min-h-0 flex-col border-r border-slate-200 bg-white/60 backdrop-blur-xl">
          <div className="flex h-16 items-center justify-between px-4">
            {historyOpen && (
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-[#e67225] to-[#c95411] shadow-[0_0_15px_rgba(230,114,37,0.3)] text-white">
                  <Bot className="h-5 w-5 text-slate-900" />
                </div>
                <div>
                  <div className="font-black text-slate-900">SilverCraft</div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Copilot</div>
                </div>
              </div>
            )}
            <IconButton label="Toggle history" onClick={() => setHistoryOpen((value) => !value)}>
              {historyOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </IconButton>
          </div>
          <div className="px-3 pb-3">
            <button onClick={() => void createChat()} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 transition hover:bg-slate-100 hover:border-slate-300">
              <Plus className="h-4 w-4 text-[#e67225]" />
              {historyOpen && 'New chat'}
            </button>
            {historyOpen && (
              <label className="relative mt-3 block">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search chats" className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder-slate-500 outline-none focus:border-[#e67225]/50 focus:bg-slate-50" />
              </label>
            )}
          </div>
          {historyOpen && <div className="px-4 pb-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Recents</div>}
          <div className="flex-1 overflow-y-auto px-2 pb-4">
            {historyOpen && visibleChats.map((chat) => (
              <div key={chat.id} className={`group relative mb-1 rounded-2xl transition ${chat.id === chatId ? 'bg-slate-100' : 'hover:bg-slate-50'}`}>
                <button onClick={() => void openChat(chat.id)} className="w-full px-3 py-3 pr-16 text-left">
                  <div className={`truncate text-sm font-semibold ${chat.id === chatId ? 'text-slate-900' : 'text-slate-700 group-hover:text-slate-900'}`}>{chat.title}</div>
                  <div className="mt-1 truncate text-xs text-slate-500">{chat.updated_at ? new Date(chat.updated_at).toLocaleString() : 'New conversation'}</div>
                </button>
                <div className="absolute right-2 top-2 hidden gap-1 group-hover:flex">
                  <IconButton label="Rename chat" onClick={() => void renameChat(chat)}><Pencil className="h-3 w-3" /></IconButton>
                  <IconButton label="Delete chat" onClick={() => void removeChat(chat)}><Trash2 className="h-3 w-3" /></IconButton>
                </div>
              </div>
            ))}
          </div>
        </aside>

        <section className="relative flex min-w-0 min-h-0 flex-col">
          {canvasAvailable && !canvasOpen && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="absolute right-5 top-4 z-10">
              <IconButton label="Open agent canvas" onClick={() => setCanvasOpen(true)}><PanelRightOpen className="h-4 w-4" /></IconButton>
            </motion.div>
          )}
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-6 md:px-10">
            {messages.length === 0 ? (
              <div className="flex min-h-full items-start justify-center pt-14 pb-12">
                <div className="w-full max-w-3xl text-center">
                  <div className="inline-flex items-center gap-2 rounded-full border border-[#e67225]/30 bg-[#e67225]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[#e67225]">
                    <Sparkles className="h-3 w-3" /> ADM Version 2.0 Ready
                  </div>
                  <div className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">{greeting.greeting.title}</div>
                  <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-500">{greeting.greeting.subtitle}</p>
                  <div className="mt-7 grid gap-3 sm:grid-cols-2">
                    {greeting.starters.map((starter) => (
                      <button key={starter} onClick={() => void sendPrompt(undefined, starter)} className="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-left text-sm leading-6 text-slate-700 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-[#e67225]/30 hover:bg-slate-100 hover:shadow-[0_10px_20px_-10px_rgba(230,114,37,0.3)]">
                        {starter}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <AnimatePresence mode="wait">
                <motion.div 
                  key={chatId}
                  initial={{ opacity: 0, x: -15 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 15 }}
                  transition={{ duration: 0.2 }}
                  className="mx-auto max-w-4xl py-8 overflow-x-hidden"
                >
                  <AnimatePresence initial={false}>
                  {isChatLoading ? (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex min-h-[300px] items-center justify-center">
                      <div className="flex flex-col items-center gap-4">
                        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-[#e67225]" />
                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Loading context...</div>
                      </div>
                    </motion.div>
                  ) : messages.map((message, index) => (
                    <motion.article 
                      key={message.id}
                      initial={{ opacity: 0, y: 15, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.3, type: "spring", bounce: 0.3 }}
                      className={`group flex gap-4 py-6 ${message.sender === 'user' ? 'justify-end' : ''}`}
                    >
                      <div className={`min-w-0 ${message.sender === 'user' ? 'max-w-[85%] text-right' : 'flex-1'}`}>
                        {message.sender !== 'user' && message.sender !== 'system' && (
                          <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                            <Bot className="h-3.5 w-3.5 text-[#e67225]" />
                            SilverCraft copilot
                          </div>
                        )}
                        {message.sender === 'system' ? (
                          <div className="mb-2 flex flex-col gap-1.5 border-l-2 border-slate-200 py-1 pl-4 opacity-70 transition hover:opacity-100">
                             <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                               <Sparkles className="h-3 w-3 text-[#e67225]" />
                               {message.eventType === 'thinking' ? 'Reasoning' : message.eventType === 'tool_call' ? 'Tool Execution' : message.eventType === 'peer_call' ? 'Delegating' : 'System Event'}
                             </div>
                             <div className="text-xs font-medium text-slate-500">{message.text}</div>
                          </div>
                        ) : (
                          <div className={`whitespace-pre-wrap text-[15px] leading-relaxed ${message.sender === 'user' ? 'inline-block rounded-3xl bg-[#e67225] px-5 py-3 text-white shadow-md' : 'prose prose-sm max-w-none text-slate-700 prose-strong:text-slate-900 prose-a:text-[#e67225]'}`}>
                            {message.sender === 'assistant' ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown> : message.text}
                          </div>
                        )}
                        {message.sender === 'assistant' && index === messages.length - 1 && (
                          <FollowUpActions onSelect={(followUp) => void sendPrompt(message.stage, followUp)} />
                        )}
                        <div className={`mt-3 flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'} opacity-0 transition group-hover:opacity-100`}>
                          <IconButton label="Copy message" onClick={() => navigator.clipboard.writeText(message.text)}>
                            <Copy className="h-3.5 w-3.5" />
                          </IconButton>
                          {message.sender === 'assistant' && (
                            <IconButton label="Regenerate response" onClick={() => {
                              const priorUser = [...messages.slice(0, index)].reverse().find((item) => item.sender === 'user');
                              if (priorUser) void sendPrompt(message.stage, priorUser.text.replace(/^Used \/[^\n]+ skill\n/, ''));
                            }}>
                              <RotateCcw className="h-3.5 w-3.5" />
                            </IconButton>
                          )}
                        </div>
                      </div>
                      </motion.article>
                  ))}
                  {busy && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="my-5 rounded-2xl border border-[#e67225]/20 bg-white/70 p-4 shadow-sm">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-700"><span className="h-2 w-2 animate-pulse rounded-full bg-[#e67225]" /> ADM architect activity</div>
                      <div className="mt-3 space-y-2">{activity.slice(-3).map((item, itemIndex) => <div key={`${item}-${itemIndex}`} className="text-xs text-slate-500">{item}</div>)}</div>
                    </motion.div>
                  )}
                  {showReasoning && reasoningSteps.length > 0 && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="my-5 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-700"><BrainCircuit className="h-3.5 w-3.5 text-[#e67225]" /> Chain of Thought</div>
                        <button onClick={() => setReasoningSteps([])} className="text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600">Clear</button>
                      </div>
                      <div className="mt-3 max-h-72 overflow-y-auto space-y-1.5">
                        {reasoningSteps.map((step) => (
                          <div key={step.id} className="flex gap-2 text-[11px]">
                            <div className="mt-0.5 flex-shrink-0">
                              {step.type === 'started' && <div className="h-2 w-2 rounded-full bg-emerald-500" />}
                              {step.type === 'thinking' && <div className="h-2 w-2 rounded-full bg-blue-500" />}
                              {step.type === 'tool_call' && <div className="h-2 w-2 rounded-full bg-amber-500" />}
                              {step.type === 'peer_call' && <div className="h-2 w-2 rounded-full bg-purple-500" />}
                              {step.type === 'gate_ready' && <div className="h-2 w-2 rounded-full bg-[#e67225]" />}
                              {step.type === 'output' && <div className="h-2 w-2 rounded-full bg-slate-900" />}
                              {step.type === 'completed' && <div className="h-2 w-2 rounded-full bg-emerald-600" />}
                              {step.type === 'error' && <div className="h-2 w-2 rounded-full bg-rose-500" />}
                              {step.type === 'activity' && <div className="h-2 w-2 rounded-full bg-slate-400" />}
                            </div>
                            <div className="flex-1">
                              <div className="font-semibold text-slate-700">{step.title}</div>
                              {step.detail && <div className="text-slate-500">{step.detail}</div>}
                              {(step.agent || step.tool) && <div className="text-slate-400">{[step.agent, step.tool].filter(Boolean).join(' · ')}</div>}
                              <div className="text-[9px] text-slate-400">{new Date(step.timestamp).toLocaleTimeString()}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                  </AnimatePresence>
                </motion.div>
              </AnimatePresence>
            )}
          </div>

          {/* Composer */}
          <div className={messages.length === 0 ? "absolute inset-x-0 top-[78%] z-10 -translate-y-1/2 px-5" : "px-5 pb-4 pt-2"}>
            <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white/90 shadow-[0_12px_35px_rgba(23,20,15,0.12)] backdrop-blur-2xl">
              <div className="flex flex-wrap items-center gap-2 px-4 pt-2.5">
                <div className="relative">
                  {modelDropdownOpen && <div className="fixed inset-0 z-40" onClick={() => setModelDropdownOpen(false)} />}
                  <button onClick={() => setModelDropdownOpen((val) => !val)} className="relative z-50 flex items-center justify-between min-w-40 max-w-52 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-100 transition outline-none">
                    <span className="truncate">{models.find((m) => (m.value || m.id) === selectedModel)?.label || selectedModel || 'Platform model'}</span>
                    <ChevronDown className="ml-1.5 h-3 w-3 text-slate-400" />
                  </button>
                  <AnimatePresence>
                    {modelDropdownOpen && (
                      <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="absolute bottom-full left-0 mb-2 w-56 max-h-48 overflow-y-auto rounded-2xl border border-slate-200 bg-white/90 p-1.5 shadow-lg backdrop-blur-xl z-50">
                        {models.map((item) => (
                          <button key={item.value || item.id} onClick={() => { setModel(item.value || item.id || ''); setModelDropdownOpen(false); }} className={`w-full text-left px-3 py-2 text-[11px] font-semibold rounded-xl transition ${selectedModel === (item.value || item.id) ? 'bg-[#e67225]/10 text-[#e67225]' : 'text-slate-600 hover:bg-slate-50'}`}>
                            {item.label || item.name || item.value || item.id}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <button onClick={() => uploadRef.current?.click()} disabled={busy} className="rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-100 transition">
                  <FileUp className="mr-1.5 inline h-3.5 w-3.5" />Attach files{attachments.length ? ` (${attachments.length})` : ''}
                </button>
                <button onClick={() => setShowConnection(true)} className="rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-100 transition">
                  <Database className="mr-1.5 inline h-3.5 w-3.5" />Connect DB
                </button>
              </div>

              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 px-5 pt-4">
                  {attachments.map((file) => (
                    <span key={file.id} className="inline-flex items-center gap-1.5 rounded-full border border-[#e67225]/30 bg-[#e67225]/10 px-3 py-1.5 text-[11px] font-medium text-[#e67225]">
                      <FileText className="h-3.5 w-3.5" />
                      {file.name}
                      <button onClick={() => setAttachments((items) => items.filter((item) => item.id !== file.id))} className="ml-1 text-[#e67225] hover:text-slate-900"><X className="h-3.5 w-3.5" /></button>
                    </span>
                  ))}
                </div>
              )}
              <div className="relative px-4 pb-2.5 pt-2">
                <input ref={uploadRef} type="file" multiple className="hidden" onChange={(e) => void upload(e.target.files)} />
                {skillOpen && (
                  <div className="absolute bottom-[calc(100%+8px)] left-5 right-5 z-20 max-h-60 overflow-auto rounded-3xl border border-slate-200 bg-white p-2 shadow-2xl backdrop-blur-xl">
                    {skills.filter((skill) => `/${skill.name}`.toLowerCase().includes(prompt.toLowerCase())).map((skill) => (
                      <button key={skill.id} onClick={() => { setActiveSkill(skill); setPrompt(''); setSkillOpen(false); }} className="block w-full rounded-2xl p-4 text-left hover:bg-slate-50 transition">
                        <div className="text-sm font-bold text-[#e67225]">/{skill.name}</div>
                        <div className="mt-1 text-xs text-slate-500">{skill.description}</div>
                        <div className="mt-2 line-clamp-2 text-[10px] text-slate-500">{skill.content}</div>
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex flex-col w-full rounded-xl bg-transparent py-1">
                  {activeSkill && (
                    <div className="mb-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e67225]/10 px-3 py-1 text-xs font-bold text-[#e67225] border border-[#e67225]/20">
                        <Sparkles className="h-3 w-3" />
                        {activeSkill.name}
                        <button onClick={() => setActiveSkill(null)} className="ml-1 hover:text-slate-900"><X className="h-3 w-3" /></button>
                      </span>
                    </div>
                  )}
                  <textarea 
                    value={prompt} 
                    onChange={(e) => { 
                      if (e.target.value.startsWith('/')) {
                        setSkillOpen(true);
                      } else {
                        setSkillOpen(false);
                      }
                      setPrompt(e.target.value);
                    }} 
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendPrompt(); } }} 
                    placeholder={activeSkill ? "Add instructions for this skill..." : "Ask a question, describe your model, or type / for skills…"}
                    className="w-full resize-none bg-transparent text-sm leading-6 text-slate-900 outline-none placeholder:text-slate-500"
                    rows={composerRows}
                  />
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-2 mt-1">
                  <div className="text-[11px] font-medium text-slate-500">
                    {attachments.length ? `${attachments.length} file(s) attached to this chat` : 'General replies stay in chat. Delegated artifacts open the canvas.'}
                  </div>
                  <button onClick={() => void sendPrompt()} disabled={busy || !prompt.trim()} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#e67225] px-3 text-xs font-bold text-white shadow-sm transition duration-300 hover:scale-105 hover:bg-[#cf5e19] disabled:opacity-50 disabled:hover:scale-100">
                    {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {busy ? 'Working…' : 'Send'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <AnimatePresence>{canvasAvailable && canvasOpen && canvas}</AnimatePresence>
      </main>

      {/* Database Connection Modal */}
      {showConnection && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-50/80 p-4 backdrop-blur-sm">
          <form onSubmit={saveConnection} className="w-full max-w-md rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <h2 className="text-base font-bold text-slate-900">Database connection request</h2>
                <p className="mt-1 text-xs text-slate-500">Password is not stored or shown back.</p>
              </div>
              <button type="button" onClick={() => setShowConnection(false)} className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid gap-4 p-6">
              <select value={connection.provider} onChange={(e) => setConnection({ ...connection, provider: e.target.value })} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-[#e67225]/50 focus:bg-slate-100 [&>option]:bg-white">
                <option>PostgreSQL</option><option>Snowflake</option><option>Databricks</option><option>BigQuery</option>
              </select>
              {(['host', 'database', 'username', 'password'] as const).map((field) => (
                <input 
                  key={field} 
                  required 
                  type={field === 'password' ? 'password' : 'text'} 
                  value={connection[field]} 
                  onChange={(e) => setConnection({ ...connection, [field]: e.target.value })} 
                  placeholder={field === 'username' ? 'Read-only username' : field[0].toUpperCase() + field.slice(1)} 
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder-slate-500 outline-none focus:border-[#e67225]/50 focus:bg-slate-100" 
                />
              ))}
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 rounded-b-3xl">
              <button type="button" onClick={() => setShowConnection(false)} className="rounded-full px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-900 transition">Cancel</button>
              <button className="rounded-full bg-white px-6 py-2 text-xs font-bold text-slate-900 transition hover:scale-105">Attach request</button>
            </div>
          </form>
        </div>
      )}

      {/* Error toast with auto-dismiss */}
      {error && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-rose-500/30 bg-rose-950/90 px-5 py-2.5 text-xs font-bold text-rose-200 shadow-[0_10px_40px_rgba(225,29,72,0.3)] backdrop-blur-md">
          {error}
          <button onClick={() => setError('')} className="rounded-full p-1 hover:bg-rose-900"><X className="h-3 w-3" /></button>
        </div>
      )}
      
      {/* Rename Chat Modal */}
      <AnimatePresence>
        {chatToRename && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
              <h3 className="text-lg font-black text-slate-900">Rename Chat</h3>
              <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} className="mt-4 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-[#e67225]/50" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') void executeRename(); }} />
              <div className="mt-6 flex justify-end gap-2">
                <button onClick={() => setChatToRename(null)} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50">Cancel</button>
                <button onClick={() => void executeRename()} className="rounded-xl bg-[#e67225] px-4 py-2 text-xs font-bold text-white hover:bg-[#c95411]">Save</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Chat Modal */}
      <AnimatePresence>
        {chatToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
              <h3 className="text-lg font-black text-slate-900">Delete Chat</h3>
              <p className="mt-2 text-sm text-slate-500">Are you sure you want to delete “{chatToDelete.title}”? This action cannot be undone.</p>
              <div className="mt-6 flex justify-end gap-2">
                <button onClick={() => setChatToDelete(null)} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50">Cancel</button>
                <button onClick={() => void executeDelete()} className="rounded-xl bg-red-500 px-4 py-2 text-xs font-bold text-white hover:bg-red-600">Delete</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
