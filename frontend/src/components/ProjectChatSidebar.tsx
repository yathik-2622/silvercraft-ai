import React, { useState } from "react";
import { Check, MessageSquare, PanelLeftClose, PanelLeftOpen, Pencil, Plus, Trash2, X } from "lucide-react";
import { useWorkspace } from "../workspace/WorkspaceContext";
import { ConfirmModal } from "./ConfirmModal";

const COLLAPSE_STORAGE_KEY = "adm_projectchat_sidebar_collapsed";

// localStorage is unavailable in this project's Vitest (node) environment
// and can throw in private-browsing Safari — read/write defensively so a
// missing/blocked store just falls back to "not collapsed" instead of
// crashing the whole sidebar.
function readCollapsedPref(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
function writeCollapsedPref(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // Best-effort only — collapse state just won't persist this session.
  }
}

function formatRelativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diffMin = Math.floor((Date.now() - then) / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

// Project chat's own history sidebar — brought back per user feedback
// ("show sidebar project chat history ... here only show chats created in
// project"), a partial reversal of Phase 4's "no sidebar in project chat"
// call. `chats` from WorkspaceContext is already scoped to `activeProject`
// (see WorkspaceContext.refreshChats), so no extra filtering is needed here
// — this list can never show another project's or Quick Chat's chats. No
// "Home" affordance (unlike QuickChatSidebar) since ChatWorkspace's own
// header already has a back-to-dashboard arrow right next to this sidebar.
// Collapsible to a narrow icon rail (persisted per-browser), same pattern
// as QuickChatSidebar.
export const ProjectChatSidebar: React.FC = () => {
  const { chats, activeChatId, selectChat, renameChat, deleteChat } = useWorkspace();
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(() => readCollapsedPref(COLLAPSE_STORAGE_KEY));

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      writeCollapsedPref(COLLAPSE_STORAGE_KEY, next);
      return next;
    });
  };

  const startRename = (chatId: string, currentTitle: string) => {
    setEditingChatId(chatId);
    setEditValue(currentTitle);
  };

  const commitRename = () => {
    if (editingChatId && editValue.trim()) {
      renameChat(editingChatId, editValue.trim());
    }
    setEditingChatId(null);
  };

  const confirmDelete = () => {
    if (deletingChatId) deleteChat(deletingChatId);
    setDeletingChatId(null);
  };

  if (collapsed) {
    return (
      <aside className="relative z-10 w-14 h-full flex flex-col items-center border-r border-slate-200 bg-white/80 backdrop-blur-xl shrink-0 py-3 gap-2">
        <button
          type="button"
          onClick={toggleCollapsed}
          title="Expand sidebar"
          className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
        >
          <PanelLeftOpen className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => selectChat(null)}
          title="New Chat"
          className="p-2 rounded-xl bg-brand-orange-light text-brand-orange hover:brightness-95 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
        </button>
        <div className="flex-1 overflow-y-auto w-full flex flex-col items-center gap-1 pt-1">
          {chats.map((chat) => (
            <button
              key={chat.chat_id}
              type="button"
              onClick={() => selectChat(chat.chat_id)}
              title={chat.title}
              className={`p-2 rounded-xl transition-colors cursor-pointer ${
                chat.chat_id === activeChatId ? "bg-orange-50 text-brand-orange" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              }`}
            >
              <MessageSquare className="w-4 h-4" />
            </button>
          ))}
        </div>
      </aside>
    );
  }

  return (
    <aside className="relative z-10 w-64 h-full flex flex-col border-r border-slate-200 bg-white/80 backdrop-blur-xl shrink-0">
      <div className="p-3 border-b border-slate-200 space-y-2">
        <div className="flex items-center justify-between gap-1">
          <div className="px-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Project Chats</div>
          <button
            type="button"
            onClick={toggleCollapsed}
            title="Collapse sidebar"
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer shrink-0"
          >
            <PanelLeftClose className="w-3.5 h-3.5" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => selectChat(null)}
          className="w-full flex items-center justify-center gap-2 px-2.5 py-2 rounded-xl text-xs font-bold bg-brand-orange-light text-brand-orange hover:brightness-95 transition-all cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          New Chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {chats.map((chat) => {
          const isActive = chat.chat_id === activeChatId;
          const isEditing = editingChatId === chat.chat_id;
          return (
            <div
              key={chat.chat_id}
              className={`group w-full px-2.5 py-2 rounded-xl transition-all flex items-center gap-2 ${
                isActive
                  ? "bg-orange-50 text-brand-orange border border-orange-200 font-bold"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-brand-orange" : "text-slate-400"}`} />
              {isEditing ? (
                <div className="flex-1 flex items-center gap-1 min-w-0">
                  <input
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") setEditingChatId(null);
                    }}
                    className="flex-1 min-w-0 text-xs px-1.5 py-0.5 rounded border border-brand-orange focus:outline-none"
                  />
                  <button onClick={commitRename} className="text-emerald-600 hover:bg-emerald-50 rounded p-0.5 cursor-pointer">
                    <Check className="w-3 h-3" />
                  </button>
                  <button onClick={() => setEditingChatId(null)} className="text-slate-400 hover:bg-slate-100 rounded p-0.5 cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <>
                  <button type="button" onClick={() => selectChat(chat.chat_id)} className="flex-1 min-w-0 text-left cursor-pointer">
                    <div className="text-xs truncate font-medium">{chat.title}</div>
                    <div className="text-[10px] text-slate-400 truncate font-mono">{formatRelativeDate(chat.created_at)}</div>
                  </button>
                  <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                    <button
                      onClick={() => startRename(chat.chat_id, chat.title)}
                      className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded cursor-pointer"
                      title="Rename"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => setDeletingChatId(chat.chat_id)}
                      className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
        {chats.length === 0 && <p className="px-2.5 py-2 text-[11px] text-slate-400">No chats yet in this project — send a message to start one.</p>}
      </div>

      {deletingChatId && (
        <ConfirmModal
          title="Delete chat?"
          message="This can't be undone."
          confirmLabel="Delete"
          destructive
          onConfirm={confirmDelete}
          onCancel={() => setDeletingChatId(null)}
        />
      )}
    </aside>
  );
};
