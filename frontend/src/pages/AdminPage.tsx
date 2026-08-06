import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Sparkles, Trash2, Upload, X } from "lucide-react";
import { adminApi } from "../api/client";
import { ConfirmModal } from "../components/ConfirmModal";
import type { AdminKbConfig, KbDocument } from "../types";

const MODELING_EXTENSIONS = ".md,.txt,.pdf,.docx,.pptx,.csv,.xlsx";
const SKILL_EXTENSIONS = ".yaml,.yml,.md,.txt,.pdf,.docx,.pptx";

const STATUS_BADGE: Record<string, string> = {
  processing: "bg-amber-100 text-amber-700 border-amber-200",
  ready: "bg-emerald-100 text-emerald-700 border-emerald-200",
  failed: "bg-rose-100 text-rose-700 border-rose-200",
};

function addUniqueFiles(prev: File[], incoming: FileList | null): File[] {
  if (!incoming) return prev;
  const merged = [...prev];
  for (const f of Array.from(incoming)) {
    const isDupe = merged.some((m) => m.name === f.name && m.size === f.size && m.lastModified === f.lastModified);
    if (!isDupe) merged.push(f);
  }
  return merged;
}

function FileChipList({ files, onRemove }: { files: File[]; onRemove: (idx: number) => void }) {
  if (files.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {files.map((f, idx) => (
        <span
          key={`${f.name}-${f.lastModified}-${idx}`}
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[10px]"
        >
          {f.name}
          <button
            type="button"
            onClick={() => onRemove(idx)}
            className="hover:bg-emerald-200 rounded p-0.5 cursor-pointer"
            title="Remove"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </span>
      ))}
    </div>
  );
}

export const AdminPage: React.FC = () => {
  const [config, setConfig] = useState<AdminKbConfig | null>(null);
  const [documents, setDocuments] = useState<KbDocument[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [modelingFiles, setModelingFiles] = useState<File[]>([]);
  const [modelingTitle, setModelingTitle] = useState("");
  const [chunkingStrategy, setChunkingStrategy] = useState("markdown");
  const [modelingStatus, setModelingStatus] = useState<string | null>(null);
  const [modelingError, setModelingError] = useState<string | null>(null);
  const modelingFileInputRef = useRef<HTMLInputElement>(null);

  const [skillFiles, setSkillFiles] = useState<File[]>([]);
  const [skillStatus, setSkillStatus] = useState<string | null>(null);
  const [skillError, setSkillError] = useState<string | null>(null);
  const skillFileInputRef = useRef<HTMLInputElement>(null);

  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);

  const loadDocuments = () => {
    adminApi
      .listDocuments()
      .then(setDocuments)
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load documents."));
  };

  useEffect(() => {
    adminApi.getKbConfig().then(setConfig).catch(() => {});
    loadDocuments();
  }, []);

  useEffect(() => {
    if (!documents?.some((d) => d.status === "processing")) return;
    const interval = setInterval(loadDocuments, 3000);
    return () => clearInterval(interval);
  }, [documents]);

  const handleUploadModeling = async (e: React.FormEvent) => {
    e.preventDefault();
    if (modelingFiles.length === 0) {
      setModelingError("Choose at least one file first.");
      return;
    }
    setModelingError(null);
    setModelingStatus("Uploading...");
    try {
      const result = await adminApi.uploadModeling(modelingFiles, modelingTitle.trim(), chunkingStrategy);
      const dupCount = result.results.filter((r) => r.status === "duplicate").length;
      const errCount = result.results.filter((r) => r.status === "error").length;
      const okCount = result.results.length - dupCount - errCount;
      setModelingStatus(
        `Uploaded ${okCount}/${result.results.length} file(s), processing (${chunkingStrategy} strategy)...` +
          (dupCount > 0 ? ` ${dupCount} already existed (skipped) — see below.` : "") +
          (errCount > 0 ? ` ${errCount} failed — see below.` : ""),
      );
      const failedNames = result.results.filter((r) => r.status === "error").map((r) => `${r.filename}: ${r.error}`);
      const dupNames = result.results.filter((r) => r.status === "duplicate").map((r) => `${r.filename}: ${r.note}`);
      if (failedNames.length > 0 || dupNames.length > 0) setModelingError([...dupNames, ...failedNames].join("; "));
      setModelingFiles([]);
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
    if (skillFiles.length === 0) {
      setSkillError("Choose at least one file first.");
      return;
    }
    setSkillError(null);
    setSkillStatus("Uploading...");
    try {
      const result = await adminApi.uploadSkill(skillFiles);
      const lines = result.results.map((r) => {
        if (r.status === "uploaded") return `${r.filename}: uploaded (${r.skill_id}, ${r.kind}) at scope=global`;
        if (r.status === "accepted") return `${r.filename}: sent to the Skill Normalizer — draft ${r.draft_id}`;
        return `${r.filename}: ${r.error ?? "failed"}`;
      });
      setSkillStatus(lines.join(" · "));
      setSkillFiles([]);
      if (skillFileInputRef.current) skillFileInputRef.current.value = "";
    } catch (err) {
      setSkillError(err instanceof Error ? err.message : "Upload failed.");
      setSkillStatus(null);
    }
  };

  const handleDelete = async (docId: string) => {
    try {
      await adminApi.deleteDocument(docId);
      loadDocuments();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to delete document.");
    } finally {
      setDeletingDocId(null);
    }
  };

  return (
    <div className="w-full h-[calc(100vh-3.5rem)] overflow-y-auto p-4 md:p-6 space-y-6 bg-slate-100 text-slate-800">
      <main className="max-w-5xl mx-auto space-y-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-orange-light text-brand-orange flex items-center justify-center border border-brand-orange/20 shrink-0">
              <Sparkles className="w-5.5 h-5.5" />
            </div>
            <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">Upload — Knowledge Base</h1>
          </div>
          <p className="text-xs text-slate-600 max-w-2xl leading-relaxed font-medium sm:pl-13">
            Modeling reference documents (chunked + embedded for citations) and global skill uploads. Business
            Standards moved to project creation/settings — each project's owner manages their own.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <form onSubmit={handleUploadModeling} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 text-xs shadow-2xs">
            <h3 className="font-extrabold text-sm text-slate-900">Upload Modeling Reference</h3>
            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">
                Title <span className="font-normal text-slate-400">(optional — applied to every file; leave blank to use each filename)</span>
              </label>
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
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-700 block">Files ({MODELING_EXTENSIONS})</label>
              <input
                ref={modelingFileInputRef}
                type="file"
                multiple
                accept={MODELING_EXTENSIONS}
                onChange={(e) => setModelingFiles((prev) => addUniqueFiles(prev, e.target.files))}
                className="w-full text-[11px] text-slate-600 file:mr-2 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-brand-orange-light file:text-brand-orange file:font-bold file:cursor-pointer"
              />
              <FileChipList files={modelingFiles} onRemove={(idx) => setModelingFiles((prev) => prev.filter((_, i) => i !== idx))} />
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
              Upload {modelingFiles.length > 1 ? `${modelingFiles.length} files` : ""}
            </button>
          </form>

          <form onSubmit={handleUploadSkill} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 text-xs shadow-2xs">
            <h3 className="font-extrabold text-sm text-slate-900">Upload Skill (Global)</h3>
            <p className="text-slate-500">
              A <span className="font-mono">.yaml</span>/<span className="font-mono">.yml</span> file is parsed directly at
              scope=global. Any other format goes through the Skill Normalizer, also landing at scope=global once approved.
            </p>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-700 block">Files ({SKILL_EXTENSIONS})</label>
              <input
                ref={skillFileInputRef}
                type="file"
                multiple
                accept={SKILL_EXTENSIONS}
                onChange={(e) => setSkillFiles((prev) => addUniqueFiles(prev, e.target.files))}
                className="w-full text-[11px] text-slate-600 file:mr-2 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-brand-orange-light file:text-brand-orange file:font-bold file:cursor-pointer"
              />
              <FileChipList files={skillFiles} onRemove={(idx) => setSkillFiles((prev) => prev.filter((_, i) => i !== idx))} />
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
              Upload {skillFiles.length > 1 ? `${skillFiles.length} files` : ""}
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
                      onClick={() => setDeletingDocId(doc.doc_id)}
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

      {deletingDocId && (
        <ConfirmModal
          title="Delete document?"
          message="This removes the document and all its embedded chunks. This can't be undone."
          confirmLabel="Delete"
          destructive
          onConfirm={() => handleDelete(deletingDocId)}
          onCancel={() => setDeletingDocId(null)}
        />
      )}
    </div>
  );
};
