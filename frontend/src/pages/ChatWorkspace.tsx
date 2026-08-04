import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, Bot, BookOpen, Cpu, Paperclip, Send, User, Users, Workflow, MessagesSquare, Wrench, X } from "lucide-react";
import { chatsApi, contractsApi, messagesApi, settingsApi, skillsApi } from "../api/client";
import { openReasoningSocket } from "../api/reasoningSocket";
import type { ChatMessage, Citation, ModelCatalogEntry, Project, ProjectLayer, RawFile, ReasoningEvent, Skill } from "../types";
import { ReasoningPanel } from "../components/ReasoningPanel";
import { CollaboratorsModal } from "../components/CollaboratorsModal";
import { ViewSourceModal } from "../components/ViewSourceModal";
import { CreateProjectPromptCard } from "../components/CreateProjectPromptCard";
import { DbConnectionPicker } from "../components/DbConnectionPicker";
import { FileUploadPicker } from "../components/FileUploadPicker";
import { PlanCanvas } from "../components/canvas/PlanCanvas";
import { SlashCommandMenu, type SlashMenuItem } from "../components/skills/SlashCommandMenu";
import { CreateSkillModal } from "../components/skills/CreateSkillModal";
import { useWorkspace } from "../workspace/WorkspaceContext";

interface Props {
  project: Project | null;
  onBack: () => void;
}

const GREETINGS = [
  "What are we modeling today?",
  "Ready when you are — bring a source, a question, or just an idea.",
  "Let's shape some data. What's on your mind?",
  "New canvas, blank slate. Where should we start?",
];

const SAMPLE_QUESTIONS = [
  "Model this as Canonical from my uploaded files",
  "What skills do I need for source analysis?",
  "How does 3NF normalization work?",
  "Walk me through the 4 modeling stages",
];

// Source of the per-chat model dropdown: GET /settings/models — the
// CALLING user's own saved BYOK provider's live catalog (falling back to a
// small hardcoded list server-side if that provider's /models call fails
// or nothing's configured yet — see app/core/runtime_settings.py). This
// replaced a static 7-model list that used to be hardcoded here directly.
// Scope, unchanged: this only ever selects the Orchestrator's model (Tier 0
// answering + intent classification) for THIS chat — never the
// TaskWorker/SolutionAgent models used during Tier 3 execution, which
// always stays on the platform's own model regardless of what's picked here.

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export const ChatWorkspace: React.FC<Props> = ({ project, onBack }) => {
  const { activeChatId, selectChat, refreshChats, openProject } = useWorkspace();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [reasoningEvents, setReasoningEvents] = useState<ReasoningEvent[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "connecting" | "open" | "closed" | "unauthorized">(
    "idle",
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCollaborators, setShowCollaborators] = useState(false);
  const [contractId, setContractId] = useState<string | null>(null);
  const [projectPromptSubmitting, setProjectPromptSubmitting] = useState(false);
  const [projectPromptError, setProjectPromptError] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<"reasoning" | "plan">("reasoning");
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [selectedDbConnectionId, setSelectedDbConnectionId] = useState<string | null>(null);
  const [attachedFile, setAttachedFile] = useState<RawFile | null>(null);
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
  const [showCreateSkillModal, setShowCreateSkillModal] = useState(false);
  const [orchestratorModel, setOrchestratorModel] = useState<string | null>(null);
  const [modelOptions, setModelOptions] = useState<ModelCatalogEntry[]>([]);
  const [viewingCitation, setViewingCitation] = useState<Citation | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [greeting] = useState(() => pickRandom(GREETINGS));
  // Chats this component itself created/hydrated already have correct local
  // `messages` state — skip the refetch-on-select-change so an optimistic
  // send doesn't get clobbered by the chat's still-empty server copy.
  const selfHandledChatId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  useEffect(() => {
    if (activeChatId === selfHandledChatId.current) return;
    selfHandledChatId.current = activeChatId;
    setLoadError(null);

    if (!activeChatId) {
      setMessages([]);
      setOrchestratorModel(null);
      return;
    }

    let cancelled = false;
    chatsApi
      .get(activeChatId)
      .then((chat) => {
        if (cancelled) return;
        setMessages(chat.messages || []);
        setOrchestratorModel(chat.orchestrator_model);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Failed to load chat.");
      });
    return () => {
      cancelled = true;
    };
  }, [activeChatId]);

  useEffect(() => {
    // A dashboard (project-less) chat can never have a contract — plan_task
    // only ever fires once a project exists (see the "project" gate in
    // app.graphs.orchestrator_graph's missing_info) — so skip the lookup
    // entirely rather than calling contractsApi.list with no project_id.
    if (!activeChatId || !project) {
      setContractId(null);
      return;
    }
    let cancelled = false;
    contractsApi
      .list(project.project_id)
      .then((contracts) => {
        if (cancelled) return;
        const match = contracts.find((c) => c.chat_id === activeChatId);
        setContractId(match ? match.contract_id : null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeChatId, project]);

  useEffect(() => {
    if (contractId) setRightTab("plan");
  }, [contractId]);

  useEffect(() => {
    skillsApi.list().then(setSkills).catch(() => {});
  }, []);

  useEffect(() => {
    settingsApi
      .discoverModels()
      .then((catalog) => setModelOptions(catalog.models))
      .catch(() => {});
  }, []);

  const isSlashCommand = inputText.startsWith("/");
  const slashQuery = isSlashCommand ? inputText.slice(1).toLowerCase() : "";
  const slashItems: SlashMenuItem[] = useMemo(() => {
    if (!isSlashCommand) return [];
    const filteredSkills = skills.filter(
      (s) => !slashQuery || s.skill_id.toLowerCase().includes(slashQuery) || s.title.toLowerCase().includes(slashQuery),
    );
    // `/create skill` needs a project_id (ADM_SkillDraft is project-scoped)
    // — not available yet for a dashboard chat, so it's left out of the
    // menu entirely rather than opening a modal that can only fail.
    const items: SlashMenuItem[] = project ? [{ type: "create-skill" }] : [];
    return items.concat(filteredSkills.map((skill) => ({ type: "skill" as const, skill })));
  }, [isSlashCommand, slashQuery, skills, project]);

  useEffect(() => {
    setSlashSelectedIndex(0);
  }, [slashQuery]);

  const handleSelectSlashItem = (item: SlashMenuItem) => {
    setInputText("");
    if (item.type === "create-skill") {
      setShowCreateSkillModal(true);
    } else {
      setSelectedSkillIds((prev) => (prev.includes(item.skill.skill_id) ? prev : [...prev, item.skill.skill_id]));
    }
  };

  useEffect(() => {
    if (!activeChatId) {
      setConnectionStatus("idle");
      return;
    }

    const close = openReasoningSocket(activeChatId, {
      onStatusChange: setConnectionStatus,
      onReasoningEvent: (event) => {
        if (event.type === "token" && typeof event.payload.content === "string") {
          setStreamingText((prev) => prev + event.payload.content);
          return;
        }
        setReasoningEvents((prev) => [...prev, event]);
      },
      onAssistantMessage: (message) => {
        setMessages((prev) => [...prev, message]);
        setIsThinking(false);
        setStreamingText("");
        refreshChats();
      },
      onContractEvent: (event) => {
        if (event.type === "plan_ready" && typeof event.payload.contract_id === "string") {
          setContractId(event.payload.contract_id);
        }
      },
    });

    return close;
  }, [activeChatId, refreshChats]);

  const handleModelChange = async (model: string) => {
    if (!activeChatId) return;
    setOrchestratorModel(model); // optimistic — this is a small, low-risk PATCH
    try {
      await chatsApi.patch(activeChatId, { orchestrator_model: model });
    } catch {
      // Best-effort UI state; the next chat load will reflect whatever's
      // actually persisted if this PATCH silently failed.
    }
  };

  const handleSend = async (overrideText?: string) => {
    const content = (overrideText ?? inputText).trim();
    if (!content) return;

    const skillIdsForThisMessage = selectedSkillIds;
    const dbConnectionForThisMessage = selectedDbConnectionId;
    const fileForThisMessage = attachedFile;
    setInputText("");
    setSelectedSkillIds([]);
    setSelectedDbConnectionId(null);
    setAttachedFile(null);
    setMessages((prev) => [...prev, { role: "user", content, created_at: new Date().toISOString() }]);
    setReasoningEvents([]);
    setStreamingText("");
    setIsThinking(true);

    try {
      let id = activeChatId;
      if (!id) {
        const chat = await chatsApi.create(project?.project_id);
        id = chat.chat_id;
        selfHandledChatId.current = id;
        selectChat(id);
        refreshChats();
      }
      const fileRefs = [
        ...(fileForThisMessage ? [{ raw_file_id: fileForThisMessage.raw_file_id }] : []),
        ...(dbConnectionForThisMessage ? [{ db_connection_id: dbConnectionForThisMessage }] : []),
      ];
      await messagesApi.send(id, content, fileRefs, skillIdsForThisMessage);
    } catch (err) {
      setIsThinking(false);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Failed to send: ${err instanceof Error ? err.message : "unknown error"}`,
          created_at: new Date().toISOString(),
        },
      ]);
    }
  };

  const handleCreateProject = async (name: string, domain: string, layer: ProjectLayer) => {
    if (!activeChatId) return;
    setProjectPromptError(null);
    setProjectPromptSubmitting(true);
    const chatId = activeChatId;
    try {
      const newProject = await chatsApi.createProjectForChat(chatId, { name, domain, layer });
      // Same chat, now attached to a project — switch into the project's
      // workspace and re-select this exact chat within it (openProject
      // resets activeChatId to null; selectChat right after wins, since
      // both are batched into the same React update).
      openProject(newProject);
      selectChat(chatId);
    } catch (err) {
      setProjectPromptError(err instanceof Error ? err.message : "Failed to create project.");
    } finally {
      setProjectPromptSubmitting(false);
    }
  };

  const composerInner = (
    <div className="space-y-1.5">
      {activeChatId && (
        <div className="flex items-center justify-end gap-1.5">
          <Cpu className="w-3 h-3 text-slate-400" />
          <select
            value={orchestratorModel || "gpt-4o"}
            onChange={(e) => handleModelChange(e.target.value)}
            title="Orchestrator model for this chat"
            className="text-[10px] font-bold text-slate-500 bg-transparent border-none focus:outline-none cursor-pointer hover:text-brand-orange"
          >
            {modelOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {attachedFile && (
        <div className="flex flex-wrap gap-1.5">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[10px]">
            <Paperclip className="w-2.5 h-2.5" />
            {attachedFile.original_filename} ({attachedFile.row_count} rows)
            <button
              onClick={() => setAttachedFile(null)}
              className="hover:bg-emerald-200 rounded p-0.5 cursor-pointer"
              title="Remove"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        </div>
      )}

      {selectedSkillIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedSkillIds.map((skillId) => (
            <span
              key={skillId}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 font-bold text-[10px]"
            >
              <Wrench className="w-2.5 h-2.5" />
              {skillId}
              <button
                onClick={() => setSelectedSkillIds((prev) => prev.filter((id) => id !== skillId))}
                className="hover:bg-blue-200 rounded p-0.5 cursor-pointer"
                title="Remove"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative flex items-center gap-1.5">
        <FileUploadPicker projectId={project?.project_id} onUploaded={setAttachedFile} />
        {project && (
          <DbConnectionPicker
            projectId={project.project_id}
            selectedId={selectedDbConnectionId}
            onSelect={setSelectedDbConnectionId}
          />
        )}
        {isSlashCommand && (
          <SlashCommandMenu
            items={slashItems}
            selectedIndex={slashSelectedIndex}
            onHover={setSlashSelectedIndex}
            onSelect={handleSelectSlashItem}
          />
        )}
        <input
          type="text"
          placeholder="Type a message, or / for skills..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (isSlashCommand && slashItems.length > 0) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSlashSelectedIndex((prev) => (prev + 1) % slashItems.length);
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setSlashSelectedIndex((prev) => (prev - 1 + slashItems.length) % slashItems.length);
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                handleSelectSlashItem(slashItems[slashSelectedIndex]);
                return;
              }
              if (e.key === "Escape") {
                setInputText("");
                return;
              }
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          autoFocus
          className="w-full pl-3 pr-10 py-2.5 bg-slate-100 border-none rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-brand-orange focus:bg-white shadow-inner transition-all font-medium disabled:opacity-60"
        />
        <button
          onClick={() => handleSend()}
          disabled={!inputText.trim()}
          className="absolute right-1.5 top-1.5 p-1.5 bg-brand-orange hover:bg-brand-orange-hover disabled:opacity-40 text-white rounded-lg shadow-2xs transition-all cursor-pointer"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );

  const isEmpty = messages.length === 0;

  return (
    <div className="w-full h-[calc(100vh-3.5rem)] flex flex-col bg-slate-100">
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5 shrink-0">
        <button
          onClick={onBack}
          className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all cursor-pointer shrink-0"
          title="Back to Projects"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-extrabold text-slate-900 truncate">{project ? project.name : "Dashboard Chat"}</div>
          <div className="text-[11px] text-slate-500 truncate">
            {project ? project.domain : "No project yet — attached the moment one's created"}
          </div>
        </div>
        {project && (
          <button
            onClick={() => setShowCollaborators(true)}
            className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all cursor-pointer shrink-0 flex items-center gap-1.5 px-2.5"
            title="Collaborators"
          >
            <Users className="w-3.5 h-3.5" />
            <span className="text-[11px] font-bold">{project.collaborator_user_ids.length + 1}</span>
          </button>
        )}
      </div>

      {project && showCollaborators && (
        <CollaboratorsModal project={project} onClose={() => setShowCollaborators(false)} />
      )}

      {loadError ? (
        <div className="flex-1 flex items-center justify-center text-xs font-semibold text-rose-600">
          Couldn't load this chat: {loadError}
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 min-h-0">
          <div className="h-full flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            {isEmpty ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-5 p-6">
                <div className="text-center space-y-2">
                  <div className="w-10 h-10 rounded-2xl bg-brand-orange-light text-brand-orange flex items-center justify-center mx-auto border border-brand-orange/20">
                    <Bot className="w-5 h-5" />
                  </div>
                  <p className="text-sm font-bold text-slate-700">{greeting}</p>
                </div>

                <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                  {SAMPLE_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => handleSend(q)}
                      className="px-3 py-1.5 rounded-full bg-slate-50 hover:bg-brand-orange-light border border-slate-200 hover:border-brand-orange text-[11px] font-semibold text-slate-600 hover:text-brand-orange transition-all cursor-pointer"
                    >
                      {q}
                    </button>
                  ))}
                </div>

                <motion.div layoutId="chat-composer" className="w-full max-w-xl">
                  {composerInner}
                </motion.div>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 bg-slate-50/30">
                  {messages.map((msg, idx) => (
                    <div key={idx} className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      {msg.role === "assistant" && (
                        <div className="w-7 h-7 rounded-lg bg-brand-orange-light text-brand-orange flex items-center justify-center shrink-0 border border-brand-orange/20 mt-1 shadow-2xs">
                          <Bot className="w-4 h-4" />
                        </div>
                      )}
                      <div
                        className={`max-w-[88%] rounded-2xl p-3 text-xs space-y-1.5 leading-relaxed shadow-2xs ${
                          msg.role === "user"
                            ? "bg-brand-orange text-white rounded-tr-none font-medium"
                            : "bg-white text-slate-700 border border-slate-200 rounded-tl-none"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-4 text-[10px] opacity-75 border-b border-current/10 pb-1">
                          <span className="font-bold">{msg.role === "user" ? "You" : "Modeling Assistant"}</span>
                          <span>{formatTime(msg.created_at)}</span>
                        </div>
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                        {msg.matched_skills && msg.matched_skills.length > 0 && (
                          <div className="pt-1.5 border-t border-slate-100 flex flex-wrap gap-1">
                            {msg.matched_skills.map((s) => (
                              <span
                                key={s.skill_id}
                                title={s.purpose}
                                className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold"
                              >
                                {s.title}
                              </span>
                            ))}
                          </div>
                        )}
                        {msg.citations && msg.citations.length > 0 && (
                          <div className="pt-1.5 border-t border-slate-100 flex flex-wrap gap-1">
                            {msg.citations.map((c, cIdx) => (
                              <button
                                key={cIdx}
                                onClick={() => setViewingCitation(c)}
                                title={c.snippet}
                                className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-[10px] font-bold cursor-pointer"
                              >
                                <BookOpen className="w-2.5 h-2.5" />
                                {c.title}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {msg.role === "user" && (
                        <div className="w-7 h-7 rounded-lg bg-slate-200 text-slate-700 flex items-center justify-center shrink-0 border border-slate-300 mt-1 shadow-2xs">
                          <User className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                  ))}

                  {!project &&
                    !isThinking &&
                    (() => {
                      const last = messages[messages.length - 1];
                      if (!last || !last.missing_info?.includes("project") || !last.create_project_prompt) return null;
                      return (
                        <CreateProjectPromptCard
                          prompt={last.create_project_prompt}
                          isSubmitting={projectPromptSubmitting}
                          error={projectPromptError}
                          onCreate={handleCreateProject}
                        />
                      );
                    })()}

                  {isThinking && (
                    <div className="flex gap-3 items-center text-xs text-brand-orange bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                      <div className="w-6 h-6 rounded-lg bg-brand-orange-light text-brand-orange flex items-center justify-center animate-pulse">
                        <Bot className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-medium">Thinking...</span>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>

                <motion.div layoutId="chat-composer" className="bg-white p-2.5 border-t border-slate-200">
                  {composerInner}
                </motion.div>
              </>
            )}
          </div>

          <div className="h-full flex flex-col min-h-0 gap-2">
            {contractId && (
              <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl p-1 shrink-0 shadow-2xs">
                <button
                  onClick={() => setRightTab("reasoning")}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    rightTab === "reasoning" ? "bg-brand-orange text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <MessagesSquare className="w-3.5 h-3.5" />
                  Live Reasoning
                </button>
                <button
                  onClick={() => setRightTab("plan")}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    rightTab === "plan" ? "bg-brand-orange text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <Workflow className="w-3.5 h-3.5" />
                  Plan
                </button>
              </div>
            )}

            <div className="flex-1 min-h-0">
              {rightTab === "plan" && contractId ? (
                <PlanCanvas contractId={contractId} />
              ) : (
                <ReasoningPanel
                  events={reasoningEvents}
                  streamingText={streamingText}
                  isThinking={isThinking}
                  connectionStatus={connectionStatus}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {project && showCreateSkillModal && (
        <CreateSkillModal
          projectId={project.project_id}
          onClose={() => setShowCreateSkillModal(false)}
          onCreated={() => skillsApi.list().then(setSkills).catch(() => {})}
        />
      )}

      {viewingCitation && <ViewSourceModal citation={viewingCitation} onClose={() => setViewingCitation(null)} />}
    </div>
  );
};
