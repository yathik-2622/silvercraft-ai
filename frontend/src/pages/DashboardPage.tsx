import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  Building2,
  Database,
  FileText,
  FolderKanban,
  FolderPlus,
  Lock,
  MessageSquarePlus,
  Pencil,
  Plus,
  Rocket,
  Search,
  Trash2,
  User,
  X,
} from "lucide-react";
import { projectsApi } from "../api/client";
import type { Project } from "../types";
import { useAuth } from "../auth/AuthContext";
import { useWorkspace } from "../workspace/WorkspaceContext";
import { CreateProjectCanvas } from "./CreateProjectCanvas";
import { EditProjectModal } from "../components/EditProjectModal";
import { BusinessStandardsModal } from "../components/BusinessStandardsModal";

type CanvasMode = "list" | "create";

const LAYER_LABEL: Record<string, string> = {
  silver: "Silver — Foundation",
  gold: "Gold — Product",
  bronze: "Bronze — Raw",
};

function formatRelativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diffMs = Date.now() - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const { openProject, openDashboardChat } = useWorkspace();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<"owned" | "shared">("owned");
  const [search, setSearch] = useState("");
  const [canvasMode, setCanvasMode] = useState<CanvasMode>("list");
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [previewingStandardsFor, setPreviewingStandardsFor] = useState<Project | null>(null);

  const loadProjects = () => {
    setLoadError(null);
    projectsApi
      .list("all")
      .then(setProjects)
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load projects."));
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const handleConfirmDelete = async () => {
    if (!deletingProject) return;
    setDeleteError(null);
    try {
      await projectsApi.remove(deletingProject.project_id);
      setDeletingProject(null);
      loadProjects();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete project.");
    }
  };

  if (canvasMode === "create") {
    return (
      <div className="w-full h-[calc(100vh-3.5rem)] overflow-y-auto p-4 md:p-6 bg-slate-100">
        <CreateProjectCanvas
          onCancel={() => setCanvasMode("list")}
          onCreated={(project, uploadedSourceFiles) => {
            setCanvasMode("list");
            loadProjects();
            openProject(project, uploadedSourceFiles);
          }}
        />
      </div>
    );
  }

  const owned = (projects || []).filter((p) => p.owner_user_id === user?.user_id);
  const shared = (projects || []).filter((p) => p.owner_user_id !== user?.user_id);
  const visible = tab === "owned" ? owned : shared;
  const filtered = visible.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.domain.toLowerCase().includes(q);
  });

  return (
    <div className="relative w-full h-[calc(100vh-3.5rem)] overflow-y-auto p-4 md:p-6 space-y-6 bg-slate-50 text-slate-800">
      {/* Ambient background glow — premium-studio direction (Phase 5), same
          brand-orange + cool-complementary pairing used on the project chat
          background, kept subtle enough not to fight the content. */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-15%] left-[-8%] w-[45%] h-[45%] rounded-full bg-brand-orange/10 blur-[120px]" />
        <div className="absolute bottom-[-15%] right-[-8%] w-[45%] h-[45%] rounded-full bg-blue-500/10 blur-[120px]" />
      </div>
      <main className="relative z-10 max-w-7xl mx-auto space-y-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-orange-light text-brand-orange flex items-center justify-center border border-brand-orange/20 shrink-0">
              <Database className="w-5.5 h-5.5" />
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
              Welcome{user ? `, ${user.username}` : ""}
            </h1>
          </div>
          <p className="text-xs text-slate-600 max-w-2xl leading-relaxed font-medium sm:pl-13">
            Accelerate design through AI, from concept to schema.
          </p>
        </div>

        <button
          onClick={() => openDashboardChat(null)}
          className="w-full text-left bg-gradient-to-r from-brand-orange/5 via-white to-amber-50 border-2 border-dashed border-brand-orange/40 hover:border-brand-orange rounded-2xl p-5 shadow-2xs hover:shadow-md transition-all cursor-pointer flex items-center gap-4 group"
        >
          <div className="w-11 h-11 rounded-2xl bg-brand-orange text-white flex items-center justify-center shadow-md shrink-0 group-hover:scale-105 transition-transform">
            <MessageSquarePlus className="w-5.5 h-5.5" />
          </div>
          <div className="min-w-0">
            <h3 className="font-extrabold text-sm text-slate-900 group-hover:text-brand-orange transition-colors">
              Just ask — no project required
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Start a quick chat right now. If it turns into a real modeling request, I'll help you set up a project then.
            </p>
          </div>
        </button>

        {loadError && (
          <div className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
            Couldn't reach the backend: {loadError}
          </div>
        )}

        <div className="bg-white border border-slate-200 p-2.5 rounded-2xl shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 w-full md:w-auto">
            <button
              onClick={() => setTab("owned")}
              className={`flex-1 md:flex-none px-5 py-2.5 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
                tab === "owned"
                  ? "bg-brand-orange text-white shadow-xs"
                  : "bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200"
              }`}
            >
              <FolderKanban className="w-4 h-4" />
              <span>My Projects</span>
              <span
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                  tab === "owned" ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
                }`}
              >
                {owned.length}
              </span>
            </button>

            <button
              onClick={() => setTab("shared")}
              className={`flex-1 md:flex-none px-5 py-2.5 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
                tab === "shared"
                  ? "bg-amber-600 text-white shadow-xs"
                  : "bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200"
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>Shared with me</span>
              <span
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                  tab === "shared" ? "bg-white/20 text-white" : "bg-amber-100 text-amber-800"
                }`}
              >
                {shared.length}
              </span>
            </button>
          </div>

          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search projects, domain..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {tab === "owned" && owned.length === 0 && !search && (
          <div className="bg-white border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center space-y-6 shadow-2xs">
            <div className="w-16 h-16 bg-brand-orange-light text-brand-orange rounded-2xl flex items-center justify-center mx-auto border border-brand-orange/30">
              <FolderPlus className="w-8 h-8" />
            </div>
            <div className="max-w-md mx-auto space-y-2">
              <h3 className="text-lg font-bold text-slate-900">No Projects Yet</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Create your first data modeling project to get started.
              </p>
            </div>
            <div className="max-w-md mx-auto pt-2">
              <button
                onClick={() => setCanvasMode("create")}
                className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-brand-orange via-orange-400 to-brand-orange-hover text-white font-extrabold text-sm shadow-xl transition-all flex items-center justify-center gap-3 cursor-pointer"
              >
                <Plus className="w-5 h-5 stroke-[3]" />
                <span>Create New Project</span>
              </button>
            </div>
          </div>
        )}

        {(tab !== "owned" || owned.length > 0 || search) && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tab === "owned" && (
              <div
                onClick={() => setCanvasMode("create")}
                className="p-5 rounded-3xl bg-gradient-to-br from-orange-50 via-white to-amber-50 border-2 border-dashed border-brand-orange hover:border-brand-orange-hover shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer flex flex-col items-center justify-center text-center space-y-3 group min-h-[220px]"
              >
                <div className="w-12 h-12 rounded-2xl bg-brand-orange text-white flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
                  <Plus className="w-6 h-6 stroke-[3]" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-brand-orange group-hover:text-brand-orange-hover">
                    Create New Project
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">Initialize a new Enterprise Modeling Project.</p>
                </div>
              </div>
            )}

            {filtered.map((proj, idx) => (
              <motion.div
                key={proj.project_id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: Math.min(idx, 8) * 0.04 }}
                className={`bg-white border border-slate-200 rounded-3xl p-5 shadow-2xs hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between space-y-4 group ${
                  tab === "owned" ? "hover:border-brand-orange" : "hover:border-amber-400"
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                        tab === "owned"
                          ? "bg-brand-orange-light text-brand-orange border-brand-orange/20"
                          : "bg-slate-100 text-slate-700 border-slate-200"
                      }`}
                    >
                      {proj.domain}
                    </span>
                    {tab === "shared" ? (
                      <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded border border-amber-300 flex items-center gap-1">
                        <Lock className="w-3 h-3" /> Shared
                      </span>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-slate-400 font-medium">{formatRelativeDate(proj.created_at)}</span>
                        <button
                          onClick={() => setEditingProject(proj)}
                          className="p-1 text-slate-400 hover:text-brand-orange hover:bg-brand-orange-light rounded-lg transition-colors cursor-pointer"
                          title="Edit Project"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeletingProject(proj)}
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Delete Project"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  <h3 className={`font-bold text-sm text-slate-900 ${tab === "owned" ? "group-hover:text-brand-orange" : "group-hover:text-amber-700"} transition-colors`}>
                    {proj.name}
                  </h3>

                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-600 font-medium">
                      <User className={`w-3.5 h-3.5 ${tab === "owned" ? "text-brand-orange" : "text-amber-600"}`} />
                      <span>
                        {tab === "owned" ? "You" : proj.owner_user_id} · {proj.collaborator_user_ids.length} collaborator
                        {proj.collaborator_user_ids.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 uppercase inline-block">
                      {LAYER_LABEL[proj.layer] || proj.layer}
                    </span>
                    {proj.has_business_standards && (
                      <button
                        onClick={() => setPreviewingStandardsFor(proj)}
                        className="ml-1.5 text-[9px] font-bold px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 uppercase inline-flex items-center gap-1 cursor-pointer hover:bg-purple-100 transition-colors"
                        title="View Business Standards"
                      >
                        <FileText className="w-2.5 h-2.5" />
                        Business Standards
                      </button>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end text-xs gap-1.5">
                  <button
                    onClick={() => openProject(proj)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white font-extrabold text-[11px] shadow-2xs transition-all cursor-pointer ${
                      tab === "owned" ? "bg-brand-orange hover:bg-brand-orange-hover" : "bg-amber-600 hover:bg-amber-700"
                    }`}
                  >
                    <Rocket className="w-3.5 h-3.5" />
                    <span>Launch</span>
                  </button>
                </div>
              </motion.div>
            ))}

            {filtered.length === 0 && search && (
              <div className="col-span-full p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 text-slate-500 text-xs">
                No projects matching "<span className="font-bold text-slate-700">{search}</span>".
              </div>
            )}
          </div>
        )}
      </main>

      {editingProject && (
        <EditProjectModal project={editingProject} onClose={() => setEditingProject(null)} onSaved={loadProjects} />
      )}

      {previewingStandardsFor && (
        <BusinessStandardsModal
          project={previewingStandardsFor}
          onClose={() => setPreviewingStandardsFor(null)}
          onSaved={loadProjects}
        />
      )}

      {deletingProject && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-2xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-slate-900">Delete "{deletingProject.name}"?</h3>
                <p className="text-[11px] text-slate-500">This can't be undone.</p>
              </div>
            </div>
            {deleteError && (
              <div className="text-[11px] font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                {deleteError}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setDeletingProject(null);
                  setDeleteError(null);
                }}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
