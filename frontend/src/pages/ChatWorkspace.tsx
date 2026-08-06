import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, Bot, ChevronDown, LayoutPanelTop, Paperclip, Send, Users, Workflow, Wrench, X } from "lucide-react";
import { chatsApi, contractsApi, dbConnectionsApi, messagesApi, settingsApi, skillsApi } from "../api/client";
import { openReasoningSocket } from "../api/reasoningSocket";
import type {
  ChatArtifact,
  ChatMessage,
  Citation,
  ModelCatalogEntry,
  Project,
  ProjectLayer,
  RawFile,
  ReasoningEvent,
  Skill,
} from "../types";
import { CollaboratorsModal } from "../components/CollaboratorsModal";
import { SourcePreviewModal } from "../components/SourcePreviewModal";
import { CreateProjectPromptCard } from "../components/CreateProjectPromptCard";
import { FileUploadPicker } from "../components/FileUploadPicker";
import { PlanCanvas } from "../components/canvas/PlanCanvas";
import { ArtifactCanvas } from "../components/canvas/ArtifactCanvas";
import { detectArtifactKind } from "../components/canvas/detectArtifactKind";
import { MessageBubble } from "../components/chat/MessageBubble";
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

const CANVAS_WIDTH_STORAGE_KEY = "adm_canvas_width";
const CANVAS_WIDTH_MIN = 360;
const CANVAS_WIDTH_MAX = 900;
const CANVAS_WIDTH_DEFAULT = 480;

// Exported for a pure-logic Vitest test — the actual drag handler just
// forwards `window.innerWidth - event.clientX` through this.
export function ADM_clampCanvasWidth(raw: number): number {
  return Math.min(CANVAS_WIDTH_MAX, Math.max(CANVAS_WIDTH_MIN, raw));
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
  const [rightTab, setRightTab] = useState<"artifacts" | "plan">("artifacts");
  const [artifacts, setArtifacts] = useState<ChatArtifact[]>([]);
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
  const activeArtifactDebounceRef = useRef<number | null>(null);
  // Mirrors `reasoningEvents` so the WS handler closure (stable across
  // re-renders, only rebuilt when activeChatId/refreshChats change) can
  // read the LATEST value when a turn completes, not whatever it was at
  // connection-open time.
  const reasoningEventsRef = useRef<typeof reasoningEvents>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [selectedDbConnectionId, setSelectedDbConnectionId] = useState<string | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<RawFile[]>([]);
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
  const [showCreateSkillModal, setShowCreateSkillModal] = useState(false);
  const [orchestratorModel, setOrchestratorModel] = useState<string | null>(null);
  const [modelOptions, setModelOptions] = useState<ModelCatalogEntry[]>([]);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [viewingCitation, setViewingCitation] = useState<Citation | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [greeting] = useState(() => pickRandom(GREETINGS));
  const [canvasWidth, setCanvasWidth] = useState(() => {
    const stored = Number(localStorage.getItem(CANVAS_WIDTH_STORAGE_KEY));
    return Number.isFinite(stored) && stored > 0 ? ADM_clampCanvasWidth(stored) : CANVAS_WIDTH_DEFAULT;
  });
  // The fixed canvasWidth only applies at the lg breakpoint (1024px) — below
  // that the panels stack full-width via flex-col, matching the drag handle
  // itself being `hidden lg:block`.
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia("(min-width: 1024px)").matches);

  useEffect(() => {
    localStorage.setItem(CANVAS_WIDTH_STORAGE_KEY, String(canvasWidth));
  }, [canvasWidth]);

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setIsDesktop(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const onMove = (event: PointerEvent) => setCanvasWidth(ADM_clampCanvasWidth(window.innerWidth - event.clientX));
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    const startResize = () => {
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    };
    window.addEventListener("adm:canvas-resize", startResize);
    return () => {
      window.removeEventListener("adm:canvas-resize", startResize);
      onUp();
    };
  }, []);

  const startCanvasResize = () => window.dispatchEvent(new Event("adm:canvas-resize"));
  // Chats this component itself created/hydrated already have correct local
  // `messages` state — skip the refetch-on-select-change so an optimistic
  // send doesn't get clobbered by the chat's still-empty server copy.
  const selfHandledChatId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  useEffect(() => {
    reasoningEventsRef.current = reasoningEvents;
  }, [reasoningEvents]);

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

  // DB connections are now project-creation-time-only (Phase 5) — no more
  // per-message picker in the composer. A project has at most one
  // connection since creation is the only entry point now, so "first" is
  // unambiguous; automatically included in every tier3 send for this
  // project, with zero action required in chat.
  useEffect(() => {
    if (!project) {
      setSelectedDbConnectionId(null);
      return;
    }
    dbConnectionsApi
      .list(project.project_id)
      .then((conns) => setSelectedDbConnectionId(conns[0]?.db_connection_id ?? null))
      .catch(() => setSelectedDbConnectionId(null));
  }, [project]);

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
        setMessages((prev) => [...prev, { ...message, _reasoningSnapshot: reasoningEventsRef.current }]);
        setIsThinking(false);
        setStreamingText("");
        setReasoningEvents([]);
        refreshChats();
      },
      onContractEvent: (event) => {
        if (event.type === "plan_ready" && typeof event.payload.contract_id === "string") {
          setContractId(event.payload.contract_id);
        }
      },
      onArtifact: (event) => {
        const { payload } = event;
        const kind = detectArtifactKind(payload.output);
        const artifact: ChatArtifact = {
          artifact_id: `${payload.task_id}:${Date.now()}`,
          task_id: payload.task_id,
          skill_id: payload.skill_id,
          stage: payload.stage,
          label: payload.label,
          output: payload.output,
          confidence: payload.confidence,
          kind,
          received_at: new Date().toISOString(),
        };
        setArtifacts((prev) => [...prev, artifact]);
        setRightTab("artifacts");
        // Multiple tasks in the same stage can complete within
        // milliseconds of each other (Send-based fan-out) — debounce which
        // one ends up focused so the canvas doesn't flash through several
        // auto-switches almost instantly. The history strip still records
        // every artifact immediately and losslessly via setArtifacts above.
        if (activeArtifactDebounceRef.current) window.clearTimeout(activeArtifactDebounceRef.current);
        activeArtifactDebounceRef.current = window.setTimeout(() => {
          setActiveArtifactId(artifact.artifact_id);
        }, 400);
        // Also surface a short line in this turn's reasoning accordion —
        // one source of truth (the artifact event) feeding two UI surfaces.
        setReasoningEvents((prev) => [
          ...prev,
          { type: "log", payload: { source: payload.source, message: `${payload.label} (stage ${payload.stage}) ready — ${kind}` } },
        ]);
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
    const filesForThisMessage = attachedFiles;
    setInputText("");
    setSelectedSkillIds([]);
    setSelectedDbConnectionId(null);
    setAttachedFiles([]);
    const optimisticFileRefs = [
      ...filesForThisMessage.map((f) => ({ raw_file_id: f.raw_file_id, original_filename: f.original_filename, row_count: f.row_count })),
      ...(dbConnectionForThisMessage ? [{ db_connection_id: dbConnectionForThisMessage }] : []),
    ];
    setMessages((prev) => [
      ...prev,
      { role: "user", content, created_at: new Date().toISOString(), ...(optimisticFileRefs.length > 0 ? { file_refs: optimisticFileRefs } : {}) },
    ]);
    setReasoningEvents([]);
    setStreamingText("");
    setIsThinking(true);
    setArtifacts([]);
    setActiveArtifactId(null);

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
        ...filesForThisMessage.map((f) => ({ raw_file_id: f.raw_file_id })),
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

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  const handleRegenerate = () => {
    const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
    if (lastUserMessage) handleSend(lastUserMessage.content);
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

  const currentModelLabel = modelOptions.find((o) => o.id === (orchestratorModel || "gpt-4o"))?.name || orchestratorModel || "gpt-4o";

  const composerInner = (
    <div className="relative rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(23,20,15,0.08)]">
      {isSlashCommand && (
        <SlashCommandMenu
          items={slashItems}
          selectedIndex={slashSelectedIndex}
          onHover={setSlashSelectedIndex}
          onSelect={handleSelectSlashItem}
        />
      )}

      <div className="flex flex-wrap items-center gap-2 px-3 pt-2.5">
        {activeChatId && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsModelMenuOpen((v) => !v)}
              title="Orchestrator model for this chat"
              className="flex items-center justify-between min-w-28 max-w-44 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-bold text-slate-600 hover:border-slate-300 hover:bg-slate-100 transition cursor-pointer"
            >
              <span className="truncate">{currentModelLabel}</span>
              <ChevronDown className="ml-1.5 w-3 h-3 text-slate-400 shrink-0" />
            </button>
            {isModelMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsModelMenuOpen(false)} />
                <div className="absolute bottom-full left-0 mb-1.5 w-56 max-h-48 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-lg z-50">
                  {modelOptions.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        handleModelChange(opt.id);
                        setIsModelMenuOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-[11px] font-semibold rounded-xl transition cursor-pointer ${
                        (orchestratorModel || "gpt-4o") === opt.id ? "bg-brand-orange-light text-brand-orange" : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {opt.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        <FileUploadPicker
          projectId={project?.project_id}
          onUploaded={(file) => setAttachedFiles((prev) => [...prev, file])}
        />
      </div>

      {(attachedFiles.length > 0 || selectedSkillIds.length > 0) && (
        <div className="flex flex-wrap gap-1.5 px-3 pt-2">
          {attachedFiles.map((file) => (
            <span
              key={file.raw_file_id}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-slate-200 bg-slate-50 text-slate-700 font-semibold text-[10px]"
            >
              <Paperclip className="w-2.5 h-2.5 text-slate-400" />
              {file.original_filename} ({file.row_count} rows)
              <button
                onClick={() => setAttachedFiles((prev) => prev.filter((f) => f.raw_file_id !== file.raw_file_id))}
                className="hover:bg-slate-200 rounded-full p-0.5 cursor-pointer"
                title="Remove"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
          {selectedSkillIds.map((skillId) => (
            <span
              key={skillId}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-brand-orange/25 bg-brand-orange-light text-brand-orange font-semibold text-[10px]"
            >
              <Wrench className="w-2.5 h-2.5" />
              {skillId}
              <button
                onClick={() => setSelectedSkillIds((prev) => prev.filter((id) => id !== skillId))}
                className="hover:bg-brand-orange/20 rounded-full p-0.5 cursor-pointer"
                title="Remove"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 px-3 pb-2.5 pt-2">
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
          className="flex-1 bg-transparent border-none text-xs text-slate-800 placeholder-slate-400 focus:outline-none font-medium disabled:opacity-60"
        />
        <button
          onClick={() => handleSend()}
          disabled={!inputText.trim()}
          className="inline-flex items-center justify-center h-8 w-8 shrink-0 bg-brand-orange hover:bg-brand-orange-hover disabled:opacity-40 text-white rounded-xl shadow-2xs transition-all cursor-pointer"
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
        <div className="flex-1 flex flex-col lg:flex-row gap-4 p-4 min-h-0">
          <div className="h-full flex-1 min-w-0 flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
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
                  {messages.map((msg, idx) => {
                    const isLatestAssistant = msg.role === "assistant" && idx === messages.length - 1;
                    const isCurrentTurn = idx === messages.length - 1;
                    return (
                      <MessageBubble
                        key={idx}
                        message={msg}
                        isLatestAssistant={isLatestAssistant}
                        reasoningEventsForThisTurn={
                          msg.role === "assistant" ? (isCurrentTurn ? reasoningEvents : (msg._reasoningSnapshot ?? [])) : []
                        }
                        isStreamingThisTurn={isCurrentTurn && isThinking}
                        onCopy={handleCopy}
                        onRegenerate={handleRegenerate}
                        onSelectCitation={setViewingCitation}
                        onFollowUpClick={(q) => handleSend(q)}
                      />
                    );
                  })}

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
                    <div className="flex gap-3 items-start text-xs text-brand-orange bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                      <div className="w-6 h-6 rounded-lg bg-brand-orange-light text-brand-orange flex items-center justify-center animate-pulse shrink-0">
                        <Bot className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        {streamingText ? (
                          <span className="font-medium whitespace-pre-wrap text-slate-700">{streamingText}</span>
                        ) : (
                          <span className="font-medium">
                            Thinking...
                            {connectionStatus === "connecting" && " (connecting)"}
                            {connectionStatus === "closed" && " (disconnected)"}
                          </span>
                        )}
                        {reasoningEvents.length > 0 && (
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            {reasoningEvents[reasoningEvents.length - 1]?.payload.message ??
                              `${reasoningEvents.length} step(s)`}
                          </div>
                        )}
                      </div>
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

          {(contractId || artifacts.length > 0) && (
            <>
              <div
                onPointerDown={startCanvasResize}
                className="hidden lg:block w-1.5 shrink-0 cursor-col-resize touch-none rounded-full bg-transparent hover:bg-brand-orange/20 transition-colors"
                role="separator"
                aria-label="Resize canvas"
                title="Drag to resize"
              />
              <div
                className="h-full flex flex-col min-h-0 gap-2 w-full lg:shrink-0"
                style={isDesktop ? { width: canvasWidth } : undefined}
              >
              <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl p-1 shrink-0 shadow-2xs">
                <button
                  onClick={() => setRightTab("artifacts")}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    rightTab === "artifacts" ? "bg-brand-orange text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <LayoutPanelTop className="w-3.5 h-3.5" />
                  Artifacts
                </button>
                {contractId && (
                  <button
                    onClick={() => setRightTab("plan")}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      rightTab === "plan" ? "bg-brand-orange text-white" : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <Workflow className="w-3.5 h-3.5" />
                    Plan
                  </button>
                )}
              </div>

              <div className="flex-1 min-h-0">
                {rightTab === "plan" && contractId ? (
                  <PlanCanvas contractId={contractId} />
                ) : (
                  <ArtifactCanvas
                    artifacts={artifacts}
                    activeArtifactId={activeArtifactId}
                    onSelectArtifact={setActiveArtifactId}
                    isEmpty={artifacts.length === 0}
                  />
                )}
              </div>
              </div>
            </>
          )}
        </div>
      )}

      {project && showCreateSkillModal && (
        <CreateSkillModal
          projectId={project.project_id}
          onClose={() => setShowCreateSkillModal(false)}
          onCreated={() => skillsApi.list().then(setSkills).catch(() => {})}
        />
      )}

      {viewingCitation && <SourcePreviewModal citation={viewingCitation} onClose={() => setViewingCitation(null)} />}
    </div>
  );
};
