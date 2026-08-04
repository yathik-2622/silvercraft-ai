import React, { useState } from "react";
import { Download, FileText, GitBranch, X } from "lucide-react";
import { contractsApi } from "../../api/client";
import type { ProvenanceReport } from "../../types";

interface Props {
  contractId: string;
}

export const ContractCompletionPanel: React.FC<Props> = ({ contractId }) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const [showGitForm, setShowGitForm] = useState(false);
  const [repoPath, setRepoPath] = useState("");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [isPushing, setIsPushing] = useState(false);
  const [pushResult, setPushResult] = useState<string | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);

  const [showProvenance, setShowProvenance] = useState(false);
  const [provenance, setProvenance] = useState<ProvenanceReport | null>(null);
  const [provenanceError, setProvenanceError] = useState<string | null>(null);
  const [isLoadingProvenance, setIsLoadingProvenance] = useState(false);

  const handleDownload = async () => {
    setDownloadError(null);
    setIsDownloading(true);
    try {
      await contractsApi.downloadArtifact(contractId);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePush = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoPath.trim()) return;
    setPushError(null);
    setPushResult(null);
    setIsPushing(true);
    try {
      await contractsApi.pushToGit(contractId, repoPath.trim(), remoteUrl.trim() || undefined, branch.trim() || "main");
      setPushResult("Enqueued — check the reasoning stream for the push result.");
    } catch (err) {
      setPushError(err instanceof Error ? err.message : "Failed to enqueue git push.");
    } finally {
      setIsPushing(false);
    }
  };

  const handleOpenProvenance = async () => {
    setShowProvenance(true);
    setProvenanceError(null);
    setIsLoadingProvenance(true);
    try {
      setProvenance(await contractsApi.provenance(contractId));
    } catch (err) {
      setProvenanceError(err instanceof Error ? err.message : "Failed to load provenance report.");
    } finally {
      setIsLoadingProvenance(false);
    }
  };

  return (
    <div className="border-t border-slate-200 bg-emerald-50/40 p-3 space-y-2 shrink-0">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={handleDownload}
          disabled={isDownloading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:border-brand-orange text-slate-700 hover:text-brand-orange font-bold text-[11px] shadow-2xs transition-all cursor-pointer disabled:opacity-50"
        >
          <Download className="w-3.5 h-3.5" />
          {isDownloading ? "Downloading..." : "Download DDL"}
        </button>
        <button
          onClick={() => setShowGitForm((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:border-brand-orange text-slate-700 hover:text-brand-orange font-bold text-[11px] shadow-2xs transition-all cursor-pointer"
        >
          <GitBranch className="w-3.5 h-3.5" />
          Push to Git
        </button>
        <button
          onClick={handleOpenProvenance}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:border-brand-orange text-slate-700 hover:text-brand-orange font-bold text-[11px] shadow-2xs transition-all cursor-pointer"
        >
          <FileText className="w-3.5 h-3.5" />
          Provenance Report
        </button>
      </div>

      {downloadError && <p className="text-[11px] font-semibold text-rose-600">{downloadError}</p>}

      {showGitForm && (
        <form onSubmit={handlePush} className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              type="text"
              value={repoPath}
              onChange={(e) => setRepoPath(e.target.value)}
              placeholder="Local repo path (required)"
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-semibold"
            />
            <input
              type="text"
              value={remoteUrl}
              onChange={(e) => setRemoteUrl(e.target.value)}
              placeholder="Remote URL (optional)"
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-semibold"
            />
            <input
              type="text"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="Branch"
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-semibold"
            />
          </div>
          {pushError && <p className="text-[11px] font-semibold text-rose-600">{pushError}</p>}
          {pushResult && <p className="text-[11px] font-semibold text-emerald-700">{pushResult}</p>}
          <div className="flex justify-end gap-1.5">
            <button
              type="submit"
              disabled={isPushing || !repoPath.trim()}
              className="px-3 py-1.5 rounded-lg bg-brand-orange hover:bg-brand-orange-hover text-white font-bold text-[11px] disabled:opacity-50 cursor-pointer"
            >
              {isPushing ? "Enqueuing..." : "Push"}
            </button>
          </div>
        </form>
      )}

      {showProvenance && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-2xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 shrink-0">
              <h3 className="font-extrabold text-sm text-slate-900">Skill Provenance Report</h3>
              <button
                onClick={() => setShowProvenance(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {isLoadingProvenance ? (
                <p className="text-xs text-slate-400">Loading...</p>
              ) : provenanceError ? (
                <p className="text-xs font-semibold text-rose-600">{provenanceError}</p>
              ) : provenance ? (
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-left text-slate-400 font-black uppercase tracking-wider text-[9px] border-b border-slate-100">
                      <th className="py-1.5 pr-2">Task</th>
                      <th className="py-1.5 pr-2">Skill</th>
                      <th className="py-1.5 pr-2">HITL</th>
                      <th className="py-1.5 pr-2">Confidence</th>
                      <th className="py-1.5 pr-2">Knowledge used</th>
                    </tr>
                  </thead>
                  <tbody>
                    {provenance.entries.map((entry) => (
                      <tr key={entry.task_id} className="border-b border-slate-50">
                        <td className="py-1.5 pr-2 font-bold text-slate-800">{entry.task_id}</td>
                        <td className="py-1.5 pr-2 text-slate-600">
                          {entry.skill_id} v{entry.skill_version}
                          {entry.user_selected && <span className="text-blue-600 font-bold"> (user-selected)</span>}
                        </td>
                        <td className="py-1.5 pr-2 text-slate-600">
                          {entry.hitl_mode} → {entry.hitl_outcome}
                        </td>
                        <td className="py-1.5 pr-2 text-slate-600">
                          {entry.confidence != null ? entry.confidence.toFixed(2) : "—"}
                        </td>
                        <td className="py-1.5 pr-2 text-slate-600">
                          {entry.knowledge_used.length > 0
                            ? entry.knowledge_used.map((c) => c.title).join(", ")
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
