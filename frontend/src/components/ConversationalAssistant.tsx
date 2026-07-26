import React, { useState, useRef, useEffect } from "react";
import {
  Send,
  Bot,
  User,
  Settings,
  Paperclip,
  ChevronDown,
  ChevronUp,
  Sliders,
  FileCode,
  Globe,
  Plus,
  Trash2,
  FileText,
  Eye,
  X,
  Check,
  Sparkles,
  PanelLeftClose,
  Upload,
  FileSpreadsheet,
  Tag
} from "lucide-react";
import {
  ChatMessage,
  ModelingSessionConfig,
  HitlStageId,
  SkillFile
} from "../types";

interface ConversationalAssistantProps {
  messages: ChatMessage[];
  currentStage: HitlStageId;
  sessionConfig: ModelingSessionConfig;
  onSendMessage: (text: string) => void;
  onUpdateSessionConfig: (config: ModelingSessionConfig) => void;
  onAdvanceStage: () => void;
  isLoading: boolean;
  hideParameters?: boolean;
  onToggleCollapse?: () => void;
}

export const ConversationalAssistant: React.FC<ConversationalAssistantProps> = ({
  messages,
  currentStage,
  sessionConfig,
  onSendMessage,
  onUpdateSessionConfig,
  onAdvanceStage,
  isLoading,
  hideParameters = false,
  onToggleCollapse
}) => {
  const [inputText, setInputText] = useState("");
  const [showConfigDrawer, setShowConfigDrawer] = useState(false);
  const [showNamingRuleSelector, setShowNamingRuleSelector] = useState(false);
  const [previewingSkill, setPreviewingSkill] = useState<SkillFile | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dataDictInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSend = () => {
    if (!inputText.trim()) return;
    onSendMessage(inputText);
    setInputText("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Handle Skill / Data Dict File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, isDataDict = false) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = (event.target?.result as string) || "";
        const fileTypeLabel = isDataDict ? "Data Dictionary" : "Skill File";
        const newSkill: SkillFile = {
          id: `file-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          name: `${isDataDict ? "[Data Dict] " : ""}${file.name}`,
          size: file.size,
          type: file.type || "text/plain",
          content,
          uploadedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        };

        const updatedSkills = [...(sessionConfig.skillFiles || []), newSkill];
        onUpdateSessionConfig({
          ...sessionConfig,
          skillFiles: updatedSkills
        });

        // Notify chat
        onSendMessage(`[Uploaded ${fileTypeLabel}]: ${file.name} (${(file.size / 1024).toFixed(1)} KB) attached to global context.`);
      };
      reader.readAsText(file);
    });

    if (e.target) {
      e.target.value = "";
    }
  };

  // Delete uploaded file
  const handleDeleteSkill = (skillId: string) => {
    const updatedSkills = (sessionConfig.skillFiles || []).filter((s) => s.id !== skillId);
    onUpdateSessionConfig({
      ...sessionConfig,
      skillFiles: updatedSkills
    });
  };

  const activeSkillCount = sessionConfig.skillFiles?.length || 0;
  const hasGlobalContext = Boolean(sessionConfig.globalContext && sessionConfig.globalContext.trim());

  return (
    <div className="h-full flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      {/* Top Assistant Header - Clutter Free */}
      <div className="bg-slate-50/90 border-b border-slate-200 p-3 px-3.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-orange-600 flex items-center justify-center text-white shadow-2xs shrink-0">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Modeling Assistant</span>
          </h3>
        </div>

        <div className="flex items-center gap-1.5">
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="p-1.5 hover:bg-slate-200 text-slate-500 hover:text-slate-800 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-slate-200"
              title="Collapse Chat Assistant to Left"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Message Chat Stream */}
      <div className="flex-1 overflow-auto p-3.5 space-y-3.5 bg-slate-50/30">
        {/* Initial Parameter Configuration Card at the start */}
        {!hideParameters && (
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-orange-600" />
                <h4 className="font-bold text-xs text-slate-800">Initial Parameter Configuration</h4>
              </div>
              <span className="text-[10px] text-slate-400 font-medium">Session Parameters</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase">Domain</label>
                <input
                  type="text"
                  value={sessionConfig.domain}
                  onChange={(e) => onUpdateSessionConfig({ ...sessionConfig, domain: e.target.value })}
                  className="w-full bg-slate-50 text-slate-800 p-1.5 rounded-lg border border-slate-200 font-semibold focus:outline-none focus:ring-1 focus:ring-orange-500 text-xs"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase">Modeling Style</label>
                <select
                  value={sessionConfig.modelingStyle}
                  onChange={(e) =>
                    onUpdateSessionConfig({ ...sessionConfig, modelingStyle: e.target.value as any })
                  }
                  className="w-full bg-slate-50 text-slate-800 p-1.5 rounded-lg border border-slate-200 font-semibold focus:outline-none focus:ring-1 focus:ring-orange-500 text-xs cursor-pointer"
                >
                  <option value="Canonical">Canonical</option>
                  <option value="3NF">3NF (Third Normal Form)</option>
                  <option value="Dimensional">Dimensional</option>
                  <option value="Data Vault">Data Vault</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase">Implementation Mode</label>
                <select
                  value={sessionConfig.implementationMode}
                  onChange={(e) =>
                    onUpdateSessionConfig({ ...sessionConfig, implementationMode: e.target.value as any })
                  }
                  className="w-full bg-slate-50 text-slate-800 p-1.5 rounded-lg border border-slate-200 font-semibold focus:outline-none focus:ring-1 focus:ring-orange-500 text-xs cursor-pointer"
                >
                  <option value="Greenfield">Greenfield</option>
                  <option value="Iterative Model Refinement">Iterative Refinement</option>
                </select>

                {sessionConfig.implementationMode === "Iterative Model Refinement" && (
                  <div className="mt-2 bg-orange-50/70 border border-orange-200 rounded-lg p-2 space-y-1 text-[11px]">
                    <span className="font-bold text-orange-900 block">Upload Existing Model (CSV/DDL)</span>
                    <input
                      type="file"
                      accept=".csv,.sql,.ddl,.json"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          const file = e.target.files[0];
                          onUpdateSessionConfig({ ...sessionConfig, uploadedModelFile: file.name });
                          onSendMessage(`Uploaded existing model artifact: ${file.name} for Iterative Refinement.`);
                        }
                      }}
                      className="w-full text-[10px] text-slate-600 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-[10px] file:font-semibold file:bg-orange-600 file:text-white cursor-pointer"
                    />
                    {sessionConfig.uploadedModelFile && (
                      <span className="text-[10px] text-emerald-700 font-mono font-bold block">
                        Active Model: {sessionConfig.uploadedModelFile}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase">Standard Naming Rule</label>
                <select
                  value={sessionConfig.standardNamingRule}
                  onChange={(e) =>
                    onUpdateSessionConfig({ ...sessionConfig, standardNamingRule: e.target.value as any })
                  }
                  className="w-full bg-slate-50 text-slate-800 p-1.5 rounded-lg border border-slate-200 font-semibold focus:outline-none focus:ring-1 focus:ring-orange-500 text-xs cursor-pointer"
                >
                  <option value="snake_case">snake_case</option>
                  <option value="camelCase">camelCase</option>
                  <option value="PASCAL_CASE">PASCAL_CASE</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Chat Messages */}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-2.5 ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.sender === "bot" && (
              <div className="w-7 h-7 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center shrink-0 border border-orange-200 mt-1 shadow-2xs">
                <Bot className="w-4 h-4" />
              </div>
            )}

            <div
              className={`max-w-[88%] rounded-2xl p-3 text-xs space-y-1.5 leading-relaxed shadow-2xs ${
                msg.sender === "user"
                  ? "bg-orange-600 text-white rounded-tr-none font-medium"
                  : "bg-white text-slate-700 border border-slate-200 rounded-tl-none"
              }`}
            >
              <div className="flex items-center justify-between gap-4 text-[10px] opacity-75 border-b border-current/10 pb-1">
                <span className="font-bold">{msg.sender === "user" ? "You" : "Modeling Assistant"}</span>
                <span>{msg.timestamp}</span>
              </div>

              {/* Message text */}
              <div className="whitespace-pre-wrap">{msg.text}</div>
            </div>

            {msg.sender === "user" && (
              <div className="w-7 h-7 rounded-lg bg-slate-200 text-slate-700 flex items-center justify-center shrink-0 border border-slate-300 mt-1 shadow-2xs">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-3 items-center text-xs text-orange-600 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
            <div className="w-6 h-6 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center animate-pulse">
              <Bot className="w-3.5 h-3.5" />
            </div>
            <span className="font-medium">Analyzing model structure & context...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Optional File Uploads Bar */}
      {!hideParameters && <div className="bg-slate-50 border-t border-slate-200 p-2 px-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Optional Context Uploads:</span>
          {activeSkillCount > 0 && (
            <span className="text-[10px] font-bold text-orange-600">{activeSkillCount} active files attached</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {/* Data Dictionary Upload */}
          <button
            onClick={() => dataDictInputRef.current?.click()}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white hover:bg-orange-50 text-slate-700 hover:text-orange-700 border border-slate-200 text-[11px] font-semibold transition-all shadow-2xs cursor-pointer"
            title="Upload Data Dictionary CSV/JSON/SQL"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>+ Data Dictionary</span>
          </button>

          {/* STTM Format Context Upload */}
          <button
            onClick={() => dataDictInputRef.current?.click()}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white hover:bg-orange-50 text-slate-700 hover:text-orange-700 border border-slate-200 text-[11px] font-semibold transition-all shadow-2xs cursor-pointer"
            title="Upload STTM Format Mapping Specification (CSV/Excel)"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" />
            <span>+ STTM Format</span>
          </button>

          {/* Skill Files Upload */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white hover:bg-orange-50 text-slate-700 hover:text-orange-700 border border-slate-200 text-[11px] font-semibold transition-all shadow-2xs cursor-pointer"
            title="Upload Skill Files MD/JSON/YAML"
          >
            <FileCode className="w-3.5 h-3.5 text-amber-600" />
            <span>+ Skill Files</span>
          </button>

          {/* Standardize Naming Rules */}
          <button
            onClick={() => setShowNamingRuleSelector(!showNamingRuleSelector)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white hover:bg-orange-50 text-slate-700 hover:text-orange-700 border border-slate-200 text-[11px] font-semibold transition-all shadow-2xs cursor-pointer"
            title="Configure Standard Naming Rules"
          >
            <Tag className="w-3.5 h-3.5 text-indigo-600" />
            <span>+ Standardize Naming Rules</span>
          </button>
        </div>

        {/* Inline Naming Rule Quick Selector */}
        {showNamingRuleSelector && (
          <div className="bg-white p-2 rounded-lg border border-slate-200 flex items-center justify-between gap-2 text-xs">
            <span className="font-bold text-slate-700 text-[11px]">Active Naming Rule:</span>
            <div className="flex items-center gap-1">
              {(["snake_case", "camelCase", "PASCAL_CASE"] as const).map((rule) => (
                <button
                  key={rule}
                  onClick={() => {
                    onUpdateSessionConfig({ ...sessionConfig, standardNamingRule: rule });
                    setShowNamingRuleSelector(false);
                    onSendMessage(`Updated Standard Naming Rule to: ${rule}`);
                  }}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-all ${
                    sessionConfig.standardNamingRule === rule
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {rule}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* List of Uploaded Context Files */}
        {sessionConfig.skillFiles && sessionConfig.skillFiles.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1">
            {sessionConfig.skillFiles.map((f) => (
              <div
                key={f.id}
                className="bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded-md text-[10px] font-medium shrink-0 flex items-center gap-1 shadow-2xs"
              >
                <FileText className="w-3 h-3 text-orange-600" />
                <span className="truncate max-w-[120px] font-semibold">{f.name}</span>
                <button
                  onClick={() => handleDeleteSkill(f.id)}
                  className="hover:text-rose-600 text-slate-400 p-0.5"
                  title="Remove File"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>}

      {/* Hidden File Inputs */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => handleFileUpload(e, false)}
        multiple
        accept=".txt,.md,.json,.yaml,.yml,.sql"
        className="hidden"
      />
      <input
        type="file"
        ref={dataDictInputRef}
        onChange={(e) => handleFileUpload(e, true)}
        multiple
        accept=".csv,.json,.sql,.xlsx,.txt"
        className="hidden"
      />

      {/* Chat Input Form Bar */}
      <div className="bg-white p-2.5 border-t border-slate-200">
        <div className="relative flex items-center gap-2">
          {hideParameters && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 bg-slate-100 hover:bg-orange-50 text-slate-500 hover:text-orange-700 rounded-xl border border-slate-200 transition-colors"
              title="Attach a file to the current chat command"
            >
              <Paperclip className="w-4 h-4" />
            </button>
          )}
          <div className="relative flex-1 flex items-center">
            <input
              type="text"
              placeholder="Chat with agents. Try: /skill create, upload this file to Source Analysis Agent, revise STTM..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full pl-3 pr-10 py-2.5 bg-slate-100 border-none rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-orange-500 focus:bg-white shadow-inner transition-all font-medium"
            />

            <button
              onClick={handleSend}
              disabled={!inputText.trim()}
              className="absolute right-1.5 top-1.5 p-1.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-40 text-white rounded-lg shadow-2xs transition-all cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Skill File Content Preview Modal */}
      {previewingSkill && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-2xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg overflow-hidden shadow-xl flex flex-col max-h-[80vh]">
            <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-orange-600" />
                <h3 className="font-bold text-xs text-slate-900">{previewingSkill.name}</h3>
              </div>
              <button
                onClick={() => setPreviewingSkill(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 overflow-auto bg-slate-950 text-slate-100 text-xs font-mono leading-relaxed flex-1">
              <pre className="whitespace-pre-wrap">{previewingSkill.content}</pre>
            </div>
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setPreviewingSkill(null)}
                className="px-3 py-1.5 rounded-lg bg-orange-600 text-white text-xs font-bold"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
