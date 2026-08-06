import React, { useState } from "react";
import {
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  FolderKanban,
  LogOut,
  MessageSquare,
  MessageSquarePlus,
  Pencil,
  Plus,
  Settings,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { useWorkspace } from "../workspace/WorkspaceContext";
import { ConfirmModal } from "./ConfirmModal";

interface Props {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onSelectProjects: () => void;
  onSelectSkillLibrary: () => void;
  onSelectSettings: () => void;
  onSelectAdmin: () => void;
  activeView: "dashboard" | "skills" | "settings" | "admin";
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

export const SidebarNavigator: React.FC<Props> = ({
  isCollapsed,
  onToggleCollapse,
  onSelectProjects,
  onSelectSkillLibrary,
  onSelectSettings,
  onSelectAdmin,
  activeView,
}) => {
  const { user, logout } = useAuth();
  const { activeProject, isDashboardChat, chats, activeChatId, selectChat, openDashboardChat, renameChat, deleteChat } =
    useWorkspace();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);

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

  return (
    <aside
      className={`bg-white text-slate-800 h-screen sticky top-0 flex flex-col transition-all duration-300 border-r border-slate-200 shadow-sm z-40 shrink-0 ${
        isCollapsed ? "w-16" : "w-64"
      }`}
    >
      <div className="p-3 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0 bg-slate-50/90 h-12">
        <button
          type="button"
          onClick={onToggleCollapse}
          className={`p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer shrink-0 border border-slate-200 ${
            isCollapsed ? "mx-auto" : "ml-auto"
          }`}
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-4">
        <div className="space-y-1">
          <button
            type="button"
            onClick={onSelectProjects}
            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              !activeProject && activeView === "dashboard"
                ? "bg-slate-100 text-slate-900 font-extrabold shadow-2xs border border-slate-200"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            } ${isCollapsed ? "justify-center px-0" : ""}`}
            title="Projects"
          >
            <FolderKanban className="w-4 h-4 text-slate-500 shrink-0" />
            {!isCollapsed && <span>Projects</span>}
          </button>

          <button
            type="button"
            onClick={onSelectSkillLibrary}
            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              !activeProject && activeView === "skills"
                ? "bg-slate-100 text-slate-900 font-extrabold shadow-2xs border border-slate-200"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            } ${isCollapsed ? "justify-center px-0" : ""}`}
            title="Skill Repository"
          >
            <BookOpen className="w-4 h-4 text-slate-500 shrink-0" />
            {!isCollapsed && <span>Skill Repository</span>}
          </button>

          <button
            type="button"
            onClick={() => openDashboardChat(null)}
            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              isDashboardChat && !activeChatId
                ? "bg-slate-100 text-slate-900 font-extrabold shadow-2xs border border-slate-200"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            } ${isCollapsed ? "justify-center px-0" : ""}`}
            title="Quick Chat — no project required"
          >
            <MessageSquarePlus className="w-4 h-4 text-slate-500 shrink-0" />
            {!isCollapsed && <span>Quick Chat</span>}
          </button>

          {user?.is_admin && (
            <button
              type="button"
              onClick={onSelectAdmin}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                !activeProject && activeView === "admin"
                  ? "bg-slate-100 text-slate-900 font-extrabold shadow-2xs border border-slate-200"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              } ${isCollapsed ? "justify-center px-0" : ""}`}
              title="Upload — Knowledge Base"
            >
              <ShieldCheck className="w-4 h-4 text-slate-500 shrink-0" />
              {!isCollapsed && <span>Upload</span>}
            </button>
          )}
        </div>

        {(activeProject || isDashboardChat) && (
          <div className="space-y-1 pt-2 border-t border-slate-200">
            {!isCollapsed && (
              <div className="px-2 flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {activeProject ? "Recent Chats" : "Dashboard Chats"}
                </span>
                <button
                  type="button"
                  onClick={() => selectChat(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-brand-orange hover:bg-brand-orange-light transition-colors cursor-pointer"
                  title="New chat"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="space-y-0.5">
              {chats.map((chat) => {
                const isActive = chat.chat_id === activeChatId;
                const isEditing = editingChatId === chat.chat_id;
                if (isCollapsed) {
                  return (
                    <button
                      key={chat.chat_id}
                      type="button"
                      onClick={() => selectChat(chat.chat_id)}
                      className={`w-full flex items-center justify-center px-0 py-2 rounded-xl cursor-pointer ${
                        isActive ? "bg-orange-50 text-brand-orange" : "text-slate-600 hover:bg-slate-100"
                      }`}
                      title={chat.title}
                    >
                      <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                    </button>
                  );
                }
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
                        <button
                          type="button"
                          onClick={() => selectChat(chat.chat_id)}
                          className="flex-1 min-w-0 text-left cursor-pointer"
                        >
                          <div className="text-xs truncate font-medium">{chat.title}</div>
                          <div className="text-[10px] text-slate-400 truncate font-mono">
                            {formatRelativeDate(chat.created_at)}
                          </div>
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

              {chats.length === 0 && !isCollapsed && (
                <p className="px-2.5 py-2 text-[11px] text-slate-400">No chats yet — send a message to start one.</p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-slate-200 bg-slate-50/90 shrink-0 relative">
        {showProfileMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowProfileMenu(false)} />
            <div
              className={`absolute bottom-16 ${
                isCollapsed ? "left-2 w-56" : "left-3 right-3"
              } bg-white rounded-2xl shadow-xl border border-slate-200 z-50 overflow-hidden text-xs divide-y divide-slate-100`}
            >
              <div className="p-1.5 space-y-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setShowProfileMenu(false);
                    onSelectSettings();
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors cursor-pointer font-medium text-xs ${
                    activeView === "settings" ? "bg-slate-100 text-slate-900 font-bold" : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <Settings className="w-4 h-4 text-slate-500" />
                  <span>Settings</span>
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowProfileMenu(false);
                  logout();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer font-bold text-xs"
              >
                <LogOut className="w-4 h-4 text-rose-600" />
                <span>Sign Out</span>
              </button>
            </div>
          </>
        )}

        {!isCollapsed ? (
          <button
            type="button"
            onClick={() => setShowProfileMenu((v) => !v)}
            className="w-full flex items-center justify-between gap-2 p-2 rounded-xl bg-white hover:bg-orange-50/60 border border-slate-200 transition-all cursor-pointer shadow-2xs group text-left"
          >
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded-full bg-brand-orange text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs">
                {user?.username ? user.username.charAt(0).toUpperCase() : "U"}
              </div>
              <div className="truncate">
                <div className="text-xs font-extrabold text-slate-900 truncate group-hover:text-brand-orange transition-colors">
                  {user?.username}
                </div>
                {user?.is_admin && <div className="text-[10px] text-brand-orange font-mono font-bold truncate">Upload Access</div>}
              </div>
            </div>
            <ChevronUp className="w-4 h-4 text-slate-400 group-hover:text-brand-orange transition-colors shrink-0" />
          </button>
        ) : (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setShowProfileMenu((v) => !v)}
              className="w-8 h-8 rounded-full bg-brand-orange text-white font-bold text-xs flex items-center justify-center cursor-pointer shadow-2xs"
              title={user?.username}
            >
              {user?.username ? user.username.charAt(0).toUpperCase() : "U"}
            </button>
          </div>
        )}
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
