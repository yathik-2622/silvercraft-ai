import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { animate } from 'motion';
import { motion, AnimatePresence } from 'motion/react';
import { Bot, ChevronDown, ChevronLeft, ChevronRight, Copy, Database, FileText, FileUp, GitBranch, History, LoaderCircle, MessageSquare, Pencil, Plus, Search, Send, Sparkles, Table2, Trash2, X } from 'lucide-react';
import { orchestratorApi, projectsApi, sessionsApi, settingsApi, skillsApi, workflowsApi } from '../api/client';

type Message = { id: string; sender: 'user' | 'assistant' | 'system'; text: string; stage?: string };
type Artifact = { id: string; title: string; stage: string; content: string; status: 'awaiting_hitl' | 'approved' };
type Chat = { id: string; title: string; updated_at?: string };
type Skill = { id: string; name: string; description: string; content: string };
type Model = { id?: string; value?: string; name?: string; label?: string };
const stages = [{ id: '1-source-analysis', label: 'Source Analysis' }, { id: '2-conceptual', label: 'Conceptual Modeling' }, { id: '3-logical', label: 'Logical Modeling' }, { id: '4-physical-sttm', label: 'Physical Data Modeling' }];

const IconButton = ({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) => (
  <button type="button" aria-label={label} title={label} onClick={onClick} className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 bg-slate-50 text-slate-500 transition hover:border-[#e67225]/50 hover:bg-[#e67225]/10 hover:text-[#e67225]">
    {children}
  </button>
);

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
  const [historyOpen, setHistoryOpen] = useState(true); 
  const [search, setSearch] = useState(''); 
  const [view, setView] = useState<'table' | 'graph'>('table'); 
  const [artifacts, setArtifacts] = useState<Artifact[]>([]); 
  const [expanded, setExpanded] = useState<string[]>([]); 
  const [skillOpen, setSkillOpen] = useState(false); 
  const [activeSkill, setActiveSkill] = useState<Skill | null>(null);
  const [attachments, setAttachments] = useState<{ id: string; name: string }[]>([]); 
  const [error, setError] = useState(''); 
  const [showConnection, setShowConnection] = useState(false); 
  const [connection, setConnection] = useState({ provider: 'PostgreSQL', host: '', database: '', username: '', password: '' });
  
  const canvasVisible = busy || artifacts.length > 0; 
  const visibleChats = useMemo(() => chats.filter((chat) => chat.title.toLowerCase().includes(search.toLowerCase())), [chats, search]); 
  const selectedModel = model || models[0]?.value || models[0]?.id || '';
  
  const persist = (id: string, sender: Message['sender'], text: string, stage = stages[0].id) => sessionsApi.appendMessage(id, { sender, text, stage });
  const openChat = async (id: string) => { 
    const response = await sessionsApi.getChat(id); 
    setChatId(id); 
    setMessages(response.data.messages ?? []); 
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
      } 
    }; 
    void load(); 
  }, [projectId]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages.length, busy]);
  
  useEffect(() => {
    const onEnter = (event: PointerEvent) => { 
      const button = (event.target as Element | null)?.closest('button'); 
      if (button && !button.hasAttribute('disabled')) animate(button, { transform: 'scale(1.025)' } as any, { duration: 0.16, ease: 'ease-out' } as any); 
    };
    const onLeave = (event: PointerEvent) => { 
      const button = (event.target as Element | null)?.closest('button'); 
      if (button) animate(button, { transform: 'scale(1)' } as any, { duration: 0.18, ease: 'ease-out' } as any); 
    };
    const onClick = (event: MouseEvent) => { 
      const button = (event.target as Element | null)?.closest('button'); 
      if (button && !button.hasAttribute('disabled')) animate(button, { transform: ['scale(1)', 'scale(0.94)', 'scale(1)'] } as any, { duration: 0.22, ease: 'ease-in-out' } as any); 
    };
    document.addEventListener('pointerover', onEnter); 
    document.addEventListener('pointerout', onLeave); 
    document.addEventListener('click', onClick);
    return () => { 
      document.removeEventListener('pointerover', onEnter); 
      document.removeEventListener('pointerout', onLeave); 
      document.removeEventListener('click', onClick); 
    };
  }, []);
  
  useEffect(() => { 
    const canvas = scrollRef.current?.parentElement?.nextElementSibling as HTMLElement | null; 
    if (canvasVisible && canvas) animate(canvas, { opacity: [0, 1] } as any, { duration: 0.32, ease: 'ease-out' } as any); 
  }, [canvasVisible]);
  
  const sendPrompt = async (stageOverride?: string, overrideText?: string) => { 
    const text = (overrideText ?? prompt).trim(); 
    if (!text && !activeSkill) return; 
    const stage = stageOverride || artifacts.at(-1)?.stage || stages[0].id; 
    setPrompt(''); 
    setSkillOpen(false); 
    setBusy(true); 
    
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
      const response = await orchestratorApi.run({ prompt: textToSend, current_stage: stage, workflow_type: 'orchestrator', skills: skills.map((skill) => skill.name), project_id: projectId, workflow_id: workflowId, chat_id: chatId, model_name: selectedModel, schema_context: { project: project?.name, domain: project?.domain, subdomain: project?.sub_domain, attachments: attachments.map((item) => item.name), artifacts } }); 
      const artifact = response.data.artifact; 
      if (artifact) { 
        const next = { id: `artifact-${Date.now()}`, title: artifact.title, stage: artifact.stage || stage, content: artifact.content, status: 'awaiting_hitl' as const }; 
        setArtifacts((items) => [...items, next]); 
        setExpanded((items) => [...new Set([...items, next.stage])]); 
        const notice = `${stages.find((item) => item.id === next.stage)?.label || 'Modeling'} output is ready in the canvas for review.`; 
        setMessages((items) => [...items, { id: `ready-${Date.now()}`, sender: 'assistant', text: notice, stage }]); 
        await persist(chatId, 'assistant', notice, stage); 
      } else { 
        const reply = response.data.reply || 'I am ready to help.'; 
        setMessages((items) => [...items, { id: `assistant-${Date.now()}`, sender: 'assistant', text: reply, stage }]); 
        await persist(chatId, 'assistant', reply, stage); 
      } 
    } catch (e: any) { 
      setMessages((items) => [...items, { id: `error-${Date.now()}`, sender: 'system', text: e.response?.data?.detail || 'The orchestration request failed.' }]); 
    } finally { 
      setBusy(false); 
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
  const renameChat = async (chat: Chat) => { 
    const title = window.prompt('Chat name', chat.title)?.trim(); 
    if (!title) return; 
    await sessionsApi.renameChat(chat.id, title); 
    await refreshChats(chat.id); 
  };
  const removeChat = async (chat: Chat) => { 
    if (!window.confirm(`Delete “${chat.title}” from MongoDB?`)) return; 
    await sessionsApi.deleteChat(chat.id); 
    await refreshChats(); 
  };
  const upload = async (files: FileList | null) => { 
    if (!files?.length) return; 
    try { 
      const response = await projectsApi.uploadFiles(projectId, 'chat_source', Array.from(files)); 
      setAttachments((items) => [...items, ...response.data.map((file: any) => ({ id: file.id, name: file.filename }))]); 
    } catch { 
      setError('File upload failed.'); 
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
    await sessionsApi.decideHitl(workflowId, artifact.stage, { decision: 'approved', comment: 'Approved from canvas.', artifact }); 
    setArtifacts((items) => items.map((item) => item.id === artifact.id ? { ...item, status: 'approved' } : item)); 
  };

  const canvas = (
    <section className="flex min-w-0 flex-col border-l border-slate-200 bg-white/60 backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div>
          <div className="text-sm font-black text-slate-900">
            <GitBranch className="mr-1.5 inline h-4 w-4 text-[#e67225]" />
            Agent canvas
          </div>
          <p className="mt-1 text-xs text-slate-500">Delegated modeling work and HITL review.</p>
        </div>
        {!busy && (
          <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1">
            <button onClick={() => setView('table')} className={`rounded-md px-2 py-1 text-xs font-bold transition ${view === 'table' ? 'bg-[#e67225] text-white shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>
              <Table2 className="mr-1 inline h-3.5 w-3.5" />
              Table
            </button>
            <button onClick={() => setView('graph')} className={`rounded-md px-2 py-1 text-xs font-bold transition ${view === 'graph' ? 'bg-[#e67225] text-white shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>
              <GitBranch className="mr-1 inline h-3.5 w-3.5" />
              Graph
            </button>
          </div>
        )}
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
      ) : view === 'graph' ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 overflow-auto p-6">
          {stages.filter((stage) => artifacts.some((item) => item.stage === stage.id)).map((stage, index, list) => (
            <React.Fragment key={stage.id}>
              <div className="w-72 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
                <div className="text-xs font-black text-slate-900">{stage.label}</div>
                <div className="mt-1 text-[11px] text-slate-500">{artifacts.filter((item) => item.stage === stage.id).length} artifact(s)</div>
              </div>
              {index < list.length - 1 && <div className="h-8 border-l-2 border-dashed border-slate-300" />}
            </React.Fragment>
          ))}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4">
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
                  <div className="border-t border-slate-200 p-3 bg-slate-500">
                    <input onKeyDown={(e) => { if (e.key === 'Enter') { void sendPrompt(stage.id, (e.target as HTMLInputElement).value); (e.target as HTMLInputElement).value = ''; } }} placeholder={`Ask ${stage.label} agent…`} className="mb-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 placeholder-slate-500 outline-none focus:border-[#e67225]/50 focus:bg-slate-100" />
                    {items.map((artifact) => (
                      <div key={artifact.id} className="mb-3 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
                        <div className="flex justify-between text-xs font-black">
                          <span className="text-slate-900">{artifact.title}</span>
                          <span className={artifact.status === 'approved' ? 'text-emerald-400' : 'text-[#e67225]'}>{artifact.status === 'approved' ? 'Approved' : 'HITL review'}</span>
                        </div>
                        <textarea value={artifact.content} onChange={(e) => updateArtifact(artifact, e.target.value)} className="mt-2 min-h-32 w-full rounded-lg border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-700 outline-none focus:border-[#e67225]/50" />
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
    </section>
  );

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
        <div className="w-16" />
      </header>
      
      <main className={`relative z-10 grid h-[calc(100vh-56px)] transition-all duration-300 ${canvasVisible ? (historyOpen ? 'grid-cols-[290px_minmax(420px,0.9fr)_minmax(410px,1.05fr)]' : 'grid-cols-[72px_minmax(420px,0.9fr)_minmax(410px,1.05fr)]') : (historyOpen ? 'grid-cols-[290px_minmax(520px,1fr)]' : 'grid-cols-[72px_minmax(520px,1fr)]')}`}>
        <aside className="flex min-w-0 flex-col border-r border-slate-200 bg-white/60 backdrop-blur-xl">
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

        <section className="flex min-w-0 flex-col">
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 md:px-10">
            {messages.length === 0 ? (
              <div className="flex min-h-full items-center justify-center py-12">
                <div className="w-full max-w-3xl text-center">
                  <div className="inline-flex items-center gap-2 rounded-full border border-[#e67225]/30 bg-[#e67225]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[#e67225]">
                    <Sparkles className="h-3 w-3" /> ADM Version 2.0 Ready
                  </div>
                  <div className="mt-4 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">Assisted Data Modeling</div>
                  <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-slate-500">Transform your business requirements into enterprise-grade Foundation (3NF/Data Vault) and Product (Dimensional) layers using Medallion Architecture.</p>
                  <div className="mt-10 grid gap-4 sm:grid-cols-2">
                    {['Explain the difference between a foundation and product layer.', 'Profile my customer and order sources.', 'Apply standard naming rules from ADM V1.', 'Create a dimensional model for retail orders.'].map((starter) => (
                      <button key={starter} onClick={() => void sendPrompt(undefined, starter)} className="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-left text-sm leading-6 text-slate-700 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-[#e67225]/30 hover:bg-slate-100 hover:shadow-[0_10px_20px_-10px_rgba(230,114,37,0.3)]">
                        {starter}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mx-auto max-w-4xl py-8 overflow-x-hidden">
                <AnimatePresence initial={false}>
                  {messages.map((message) => (
                    <motion.article 
                      key={message.id}
                      initial={{ opacity: 0, y: 15, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.3, type: "spring", bounce: 0.3 }}
                      className={`group flex gap-4 py-6 ${message.sender === 'user' ? 'justify-end' : ''}`}
                    >
                      <div className={`min-w-0 ${message.sender === 'user' ? 'max-w-[85%] text-right' : 'flex-1'}`}>
                        {message.sender !== 'user' && (
                          <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                            <Bot className="h-3.5 w-3.5 text-[#e67225]" />
                            {message.sender === 'system' ? 'System' : 'SilverCraft copilot'}
                          </div>
                        )}
                        <div className={`whitespace-pre-wrap text-[15px] leading-relaxed ${message.sender === 'user' ? 'inline-block rounded-3xl bg-[#e67225] px-5 py-3 text-white shadow-md' : message.sender === 'system' ? 'text-rose-600' : 'text-slate-700'}`}>
                          {message.text}
                        </div>
                        <div className={`mt-3 flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'} opacity-0 transition group-hover:opacity-100`}>
                          <IconButton label="Copy message" onClick={() => navigator.clipboard.writeText(message.text)}>
                            <Copy className="h-3.5 w-3.5" />
                          </IconButton>
                        </div>
                      </div>
                    </motion.article>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="px-5 pb-5 pt-3">
            <div className="mx-auto max-w-4xl rounded-[32px] border border-slate-200 bg-white/80 shadow-[0_24px_70px_rgba(0,0,0,0.5)] backdrop-blur-2xl">
              <div className="flex flex-wrap items-center gap-3 px-5 pt-4">
                <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-[#e67225]">
                  <Sparkles className="mr-1.5 inline h-3.5 w-3.5" />Platform
                </div>
                <select value={selectedModel} onChange={(e) => setModel(e.target.value)} className="max-w-52 rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-[#e67225]/50">
                  <option value="">Platform model</option>
                  {models.map((item) => (
                    <option key={item.value || item.id} value={item.value || item.id}>{item.label || item.name || item.value || item.id}</option>
                  ))}
                </select>
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
              <div className="relative px-5 pb-4 pt-3">
                <input ref={uploadRef} type="file" multiple className="hidden" onChange={(e) => void upload(e.target.files)} />
                {skillOpen && (
                  <div className="absolute bottom-[calc(100%+8px)] left-5 right-5 z-20 max-h-60 overflow-auto rounded-3xl border border-slate-200 bg-white p-2 shadow-2xl backdrop-blur-xl">
                    {skills.map((skill) => (
                      <button key={skill.id} onClick={() => { setActiveSkill(skill); setPrompt(''); setSkillOpen(false); }} className="block w-full rounded-2xl p-4 text-left hover:bg-slate-50 transition">
                        <div className="text-sm font-bold text-[#e67225]">/{skill.name}</div>
                        <div className="mt-1 text-xs text-slate-500">{skill.description}</div>
                        <div className="mt-2 line-clamp-2 text-[10px] text-slate-500">{skill.content}</div>
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex flex-col min-h-16 w-full rounded-xl bg-transparent py-2">
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
                      if (e.target.value === '/') {
                        setSkillOpen(true);
                      } else {
                        setSkillOpen(false);
                      }
                      setPrompt(e.target.value);
                    }} 
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendPrompt(); } }} 
                    placeholder={activeSkill ? "Add instructions for this skill..." : "Ask a question, describe your model, or type / for skills…"}
                    className="w-full resize-none bg-transparent text-[15px] leading-7 text-slate-900 outline-none placeholder:text-slate-500"
                    rows={Math.min(5, prompt.split('\n').length || 1)}
                  />
                </div>
                <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-200 mt-2">
                  <div className="text-[11px] font-medium text-slate-500">
                    {attachments.length ? `${attachments.length} file(s) attached to this chat` : 'General replies stay in chat. Delegated artifacts open the canvas.'}
                  </div>
                  <button onClick={() => void sendPrompt()} disabled={busy || !prompt.trim()} className="inline-flex h-10 items-center gap-2 rounded-full bg-[#e67225] px-6 text-sm font-bold text-slate-900 shadow-[0_0_20px_rgba(230,114,37,0.4)] transition duration-300 hover:scale-105 hover:bg-[#cf5e19] disabled:opacity-50 disabled:hover:scale-100">
                    {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {busy ? 'Working…' : 'Send'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {canvasVisible && canvas}
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
    </div>
  );
};
