import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, FileText, Loader2, ShieldCheck, Sparkles, Trash2, Upload } from "lucide-react";
import { adminApi, projectsApi } from "../api/client";
import type { AdminKbConfig, KbDocument, Project } from "../types";

const MODELING_EXTENSIONS = ".md,.txt,.pdf,.docx,.pptx";
const SKILL_EXTENSIONS = ".yaml,.yml,.md,.txt,.pdf,.docx,.pptx";
const BUSINESS_STANDARDS_EXTENSIONS = ".md,.txt,.pdf,.docx,.pptx";

const STATUS_BADGE: Record<string, string> = {
  processing: "bg-amber-100 text-amber-700 border-amber-200",
  ready: "bg-emerald-100 text-emerald-700 border-emerald-200",
  failed: "bg-rose-100 text-rose-700 border-rose-200",
};

export const AdminPage: React.FC = () => {
  const [config, setConfig] = useState<AdminKbConfig | null>(null);
  const [documents, setDocuments] = useState<KbDocument[] | null>(null);
  const [defaultProjectId, setDefaultProjectId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [modelingFile, setModelingFile] = useState<File | null>(null);
  const [modelingTitle, setModelingTitle] = useState("");
  const [chunkingStrategy, setChunkingStrategy] = useState("markdown");
  const [modelingStatus, setModelingStatus] = useState<string | null>(null);
  const [modelingError, setModelingError] = useState<string | null>(null);
  const modelingFileInputRef = useRef<HTMLInputElement>(null);

  const [skillFile, setSkillFile] = useState<File | null>(null);
  const [skillStatus, setSkillStatus] = useState<string | null>(null);
  const [skillError, setSkillError] = useState<string | null>(null);
  const skillFileInputRef = useRef<HTMLInputElement>(null);

  const [projects, setProjects] = useState<Project[]>([]);
  const [bsProjectId, setBsProjectId] = useState("");
  const [bsFile, setBsFile] = useState<File | null>(null);
  const [bsStatus, setBsStatus] = useState<string | null>(null);
  const [bsError, setBsError] = useState<string | null>(null);
  const bsFileInputRef = useRef<HTMLInputElement>(null);

  const loadDocuments = () => {
    adminApi
      .listDocuments()
      .then(setDocuments)
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load documents."));
  };

  useEffect(() => {
    adminApi.getKbConfig().then(setConfig).catch(() => {});
    projectsApi.list("owned").then((projects) => setDefaultProjectId(projects[0]?.project_id ?? null)).catch(() => {});
    // "all" (not "owned") — admin uploads are platform-authoritative
    // regardless of who owns the target project, same as the skill-upload
    // path forcing scope=global regardless of a YAML's own scope field.
    projectsApi
      .list("all")
      .then((all) => {
        setProjects(all);
        setBsProjectId((prev) => prev || all[0]?.project_id || "");
      })
      .catch(() => {});
    loadDocuments();
  }, []);

  useEffect(() => {
    if (!documents?.some((d) => d.status === "processing")) return;
    const interval = setInterval(loadDocuments, 3000);
    return () => clearInterval(interval);
  }, [documents]);

  const handleUploadModeling = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modelingFile || !modelingTitle.trim()) {
      setModelingError("A file and title are both required.");
      return;
    }
    setModelingError(null);
    setModelingStatus("Uploading...");
    try {
      const result = await adminApi.uploadModeling(modelingFile, modelingTitle.trim(), chunkingStrategy);
      setModelingStatus(`Processing (${result.char_length} characters, ${result.chunking_strategy} strategy)...`);
      setModelingFile(null);
      setModelingTitle("");
      if (modelingFileInputRef.current) modelingFileInputRef.current.value = "";
      loadDocuments();
    } catch (err) {
      setModelingError(err instanceof Error ? err.message : "Upload failed.");
      setModelingStatus(null);
    }
  };

  const handleUploadSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!skillFile) {
      setSkillError("Choose a file first.");
      return;
    }
    setSkillError(null);
    setSkillStatus("Uploading...");
    try {
      const result = await adminApi.uploadSkill(skillFile, defaultProjectId || undefined);
      setSkillStatus(
        result.status === "uploaded"
          ? `Uploaded directly: ${result.skill_id} (${result.kind}) at scope=global.${result.note ? ` ${result.note}` : ""}`
          : `Sent to the Skill Normalizer — draft ${result.draft_id}. ${result.note || ""}`,
      );
      setSkillFile(null);
      if (skillFileInputRef.current) skillFileInputRef.current.value = "";
    } catch (err) {
      setSkillError(err instanceof Error ? err.message : "Upload failed.");
      setSkillStatus(null);
    }
  };

  const handleUploadBusinessStandards = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bsFile || !bsProjectId) {
      setBsError("A project and a file are both required.");
      return;
    }
    setBsError(null);
    setBsStatus("Uploading...");
    try {
      const result = await adminApi.uploadBusinessStandards(bsFile, bsProjectId);
      setBsStatus(`Saved (${result.char_length} characters) as the business standards for this project.`);
      setBsFile(null);
      if (bsFileInputRef.current) bsFileInputRef.current.value = "";
    } catch (err) {
      setBsError(err instanceof Error ? err.message : "Upload failed.");
      setBsStatus(null);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!window.confirm("Delete this document and all its embedded chunks?")) return;
    try {
      await adminApi.deleteDocument(docId);
      loadDocuments();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to delete document.");
    }
  };

  return (
    <div className="w-full h-[calc(100vh-3.5rem)] overflow-y-auto p-4 md:p-6 space-y-6 bg-slate-100 text-slate-800">
      <main className="max-w-5xl mx-auto space-y-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-orange-light text-brand-orange flex items-center justify-center border border-brand-orange/20 shrink-0">
              <ShieldCheck className="w-5.5 h-5.5" />
            </div>
            <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">Admin — Knowledge Base</h1>
          </div>
          <p className="text-xs text-slate-600 max-w-2xl leading-relaxed font-medium sm:pl-13">
            Modeling reference documents (chunked + embedded for citations) and global skill uploads.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <form onSubmit={handleUploadModeling} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 text-xs shadow-2xs">
            <h3 className="font-extrabold text-sm text-slate-900">Upload Modeling Reference</h3>
            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">Title</label>
              <input
                value={modelingTitle}
                onChange={(e) => setModelingTitle(e.target.value)}
                placeholder="e.g. 3NF Normalization Standard"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">Chunking Strategy</label>
              <select
                value={chunkingStrategy}
                onChange={(e) => setChunkingStrategy(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30"
              >
                {Object.entries(config?.chunking_strategies || { markdown: "Markdown-aware" }).map(([key, desc]) => (
                  <option key={key} value={key} title={desc}>
                    {key}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">File ({MODELING_EXTENSIONS})</label>
              <input
                ref={modelingFileInputRef}
                type="file"
                accept={MODELING_EXTENSIONS}
                onChange={(e) => setModelingFile(e.target.files?.[0] || null)}
                className="w-full text-[11px] text-slate-600 file:mr-2 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-brand-orange-light file:text-brand-orange file:font-bold file:cursor-pointer"
              />
            </div>
            {modelingError && (
              <div className="text-[11px] font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                {modelingError}
              </div>
            )}
            {modelingStatus && (
              <div className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                {modelingStatus}
              </div>
            )}
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-orange hover:bg-brand-orange-hover text-white font-bold text-xs shadow-2xs cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload
            </button>
          </form>

          <form onSubmit={handleUploadSkill} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 text-xs shadow-2xs">
            <h3 className="font-extrabold text-sm text-slate-900">Upload Skill (Global)</h3>
            <p className="text-slate-500">
              A <span className="font-mono">.yaml</span>/<span className="font-mono">.yml</span> file is parsed directly at
              scope=global. Any other format goes through the Skill Normalizer, also landing at scope=global once approved.
            </p>
            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">File ({SKILL_EXTENSIONS})</label>
              <input
                ref={skillFileInputRef}
                type="file"
                accept={SKILL_EXTENSIONS}
                onChange={(e) => setSkillFile(e.target.files?.[0] || null)}
                className="w-full text-[11px] text-slate-600 file:mr-2 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-brand-orange-light file:text-brand-orange file:font-bold file:cursor-pointer"
              />
            </div>
            {skillError && (
              <div className="text-[11px] font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                {skillError}
              </div>
            )}
            {skillStatus && (
              <div className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                {skillStatus}
              </div>
            )}
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-orange hover:bg-brand-orange-hover text-white font-bold text-xs shadow-2xs cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Upload
            </button>
          </form>

          <form onSubmit={handleUploadBusinessStandards} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 text-xs shadow-2xs">
            <h3 className="font-extrabold text-sm text-slate-900">Upload Business Standards</h3>
            <p className="text-slate-500">
              Project-scoped rules/standards text, stored whole as run-invariant context for that project's
              modeling runs — not chunked, not embedded, not searchable. Re-uploading for the same project
              replaces the prior document.
            </p>
            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">Project</label>
              <select
                value={bsProjectId}
                onChange={(e) => setBsProjectId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 cursor-pointer"
              >
                {projects.length === 0 && <option value="">No projects available</option>}
                {projects.map((p) => (
                  <option key={p.project_id} value={p.project_id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">File ({BUSINESS_STANDARDS_EXTENSIONS})</label>
              <input
                ref={bsFileInputRef}
                type="file"
                accept={BUSINESS_STANDARDS_EXTENSIONS}
                onChange={(e) => setBsFile(e.target.files?.[0] || null)}
                className="w-full text-[11px] text-slate-600 file:mr-2 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-brand-orange-light file:text-brand-orange file:font-bold file:cursor-pointer"
              />
            </div>
            {bsError && (
              <div className="text-[11px] font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                {bsError}
              </div>
            )}
            {bsStatus && (
              <div className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                {bsStatus}
              </div>
            )}
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-orange hover:bg-brand-orange-hover text-white font-bold text-xs shadow-2xs cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              Upload
            </button>
          </form>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-extrabold text-sm text-slate-900">Modeling Reference Documents</h3>
          </div>

          {loadError && (
            <div className="text-xs font-semibold text-rose-600 bg-rose-50 border-b border-rose-200 px-4 py-3">{loadError}</div>
          )}

          {documents === null ? (
            <p className="text-xs text-slate-400 text-center py-8">Loading...</p>
          ) : documents.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-8">No documents uploaded yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {documents.map((doc) => (
                <div key={doc.doc_id} className="flex items-center justify-between gap-3 px-4 py-3 text-xs">
                  <div className="min-w-0">
                    <div className="font-bold text-slate-800 truncate">{doc.title}</div>
                    <div className="text-[10px] text-slate-400 truncate">
                      {doc.filename} · {doc.chunking_strategy} · {doc.chunk_count} chunk(s) · {doc.char_length} chars
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_BADGE[doc.status]}`}>
                      {doc.status === "processing" && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                      {doc.status === "ready" && <CheckCircle2 className="w-2.5 h-2.5" />}
                      {doc.status === "failed" && <AlertCircle className="w-2.5 h-2.5" />}
                      {doc.status}
                    </span>
                    <button
                      onClick={() => handleDelete(doc.doc_id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
