import React, { useEffect, useState } from "react";
import { BookOpen, ChevronDown, ChevronUp, Lock, Search, Sparkles, User, Workflow } from "lucide-react";
import { projectsApi, skillsApi } from "../api/client";
import type { Skill, SkillKind } from "../types";
import { CreateSkillModal } from "../components/skills/CreateSkillModal";

const KIND_FILTERS: { value: SkillKind | "all"; label: string }[] = [
  { value: "all", label: "All Kinds" },
  { value: "workflow", label: "Workflow" },
  { value: "task", label: "Task" },
  { value: "utility", label: "Utility" },
];

const HITL_BADGE: Record<string, string> = {
  auto: "bg-slate-100 text-slate-600 border-slate-200",
  confidence_gated: "bg-amber-100 text-amber-700 border-amber-200",
  mandatory: "bg-rose-100 text-rose-700 border-rose-200",
};

export const SkillLibraryPage: React.FC = () => {
  const [tab, setTab] = useState<"all" | "mine">("all");
  const [kindFilter, setKindFilter] = useState<SkillKind | "all">("all");
  const [search, setSearch] = useState("");
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [defaultProjectId, setDefaultProjectId] = useState<string | null>(null);

  const loadSkills = () => {
    setLoadError(null);
    skillsApi
      .list({ mine: tab === "mine", kind: kindFilter === "all" ? undefined : kindFilter, q: search || undefined })
      .then(setSkills)
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load skills."));
  };

  useEffect(() => {
    loadSkills();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, kindFilter]);

  useEffect(() => {
    projectsApi
      .list("owned")
      .then((projects) => setDefaultProjectId(projects[0]?.project_id ?? null))
      .catch(() => {});
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadSkills();
  };

  return (
    <div className="w-full h-[calc(100vh-3.5rem)] overflow-y-auto p-4 md:p-6 space-y-6 bg-slate-100 text-slate-800">
      <main className="max-w-6xl mx-auto space-y-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs space-y-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-orange-light text-brand-orange flex items-center justify-center border border-brand-orange/20 shrink-0">
                <BookOpen className="w-5.5 h-5.5" />
              </div>
              <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">Skill Repository</h1>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              disabled={!defaultProjectId}
              title={defaultProjectId ? undefined : "Create a project first"}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-orange hover:bg-brand-orange-hover text-white font-bold text-xs shadow-2xs transition-all cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Create Skill
            </button>
          </div>
          <p className="text-xs text-slate-600 max-w-2xl leading-relaxed font-medium sm:pl-13">
            Task, Utility, and Workflow Skills available across every project.
          </p>
        </div>

        <div className="bg-white border border-slate-200 p-2.5 rounded-2xl shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 w-full md:w-auto">
            <button
              onClick={() => setTab("all")}
              className={`px-5 py-2.5 rounded-xl font-extrabold text-xs transition-all cursor-pointer ${
                tab === "all" ? "bg-brand-orange text-white shadow-xs" : "bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setTab("mine")}
              className={`px-5 py-2.5 rounded-xl font-extrabold text-xs transition-all cursor-pointer ${
                tab === "mine" ? "bg-brand-orange text-white shadow-xs" : "bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200"
              }`}
            >
              My Skills
            </button>
          </div>

          <form onSubmit={handleSearchSubmit} className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search title, purpose..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange transition-all"
            />
          </form>

          <div className="flex items-center gap-1.5">
            {KIND_FILTERS.map((k) => (
              <button
                key={k.value}
                onClick={() => setKindFilter(k.value)}
                className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                  kindFilter === k.value ? "bg-slate-800 text-white" : "bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200"
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>
        </div>

        {loadError && (
          <div className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
            Couldn't load skills: {loadError}
          </div>
        )}

        {skills === null ? (
          <p className="text-xs text-slate-400 text-center py-8">Loading...</p>
        ) : skills.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center text-slate-500 text-xs">
            {tab === "mine" ? "You haven't created any skills yet." : "No skills match this filter."}
          </div>
        ) : (
          <div className="space-y-3">
            {skills.map((skill) => {
              const isExpanded = expandedId === skill.skill_id;
              return (
                <div
                  key={`${skill.skill_id}_${skill.scope}`}
                  className="bg-white border border-slate-200 hover:border-brand-orange rounded-2xl p-4 shadow-2xs transition-all"
                >
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : skill.skill_id)}
                    className="w-full flex items-start justify-between gap-3 text-left cursor-pointer"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-xs text-slate-800">{skill.skill_id}</span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 uppercase">
                          {skill.kind}
                        </span>
                        {skill.scope === "user" ? (
                          <span className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                            <User className="w-2.5 h-2.5" /> Mine
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
                            <Lock className="w-2.5 h-2.5" /> {skill.scope}
                          </span>
                        )}
                        {skill.hitl_mode && (
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${HITL_BADGE[skill.hitl_mode]}`}>
                            {skill.hitl_mode}
                          </span>
                        )}
                      </div>
                      <h3 className="font-bold text-sm text-slate-900">{skill.title}</h3>
                      <p className="text-xs text-slate-500 line-clamp-2">{skill.purpose}</p>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-slate-400 shrink-0 mt-1" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 mt-1" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-slate-100 space-y-2.5 text-xs">
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Prompt</div>
                        <p className="text-slate-700 whitespace-pre-wrap bg-slate-50 rounded-xl p-2.5 border border-slate-100 font-mono text-[11px]">
                          {skill.prompt || "—"}
                        </p>
                      </div>
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Expected Output</div>
                        <p className="text-slate-700">{skill.expected_output || "—"}</p>
                      </div>
                      {skill.tools.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {skill.tools.map((t) => (
                            <span key={t} className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] font-mono text-slate-600">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-3 text-[10px] text-slate-400">
                        <span className="flex items-center gap-1">
                          <Workflow className="w-3 h-3" /> Stage {skill.stage ?? "—"}
                        </span>
                        <span>v{skill.version}</span>
                        {skill.hitl_reason && <span>{skill.hitl_reason}</span>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {showCreateModal && defaultProjectId && (
        <CreateSkillModal
          projectId={defaultProjectId}
          onClose={() => setShowCreateModal(false)}
          onCreated={loadSkills}
        />
      )}
    </div>
  );
};
