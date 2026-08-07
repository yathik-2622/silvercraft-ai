import React, { useEffect, useMemo, useState } from "react";
import { Download, FileText, LayoutGrid, Loader2, Package, Table2, User, X } from "lucide-react";
import { projectsApi, type ProjectArtifact } from "../api/client";
import { detectArtifactKind } from "./canvas/detectArtifactKind";
import { stageLabel } from "./canvas/stageLabels";
import type { ArtifactKind } from "../types";

interface Props {
  projectId: string;
  onClose: () => void;
  onOpenChat: (chatId: string) => void;
}

const KIND_ICON: Record<ArtifactKind, React.ReactNode> = {
  "er-diagram": <LayoutGrid className="w-3.5 h-3.5" />,
  table: <Table2 className="w-3.5 h-3.5" />,
  markdown: <FileText className="w-3.5 h-3.5" />,
  keyvalue: <Table2 className="w-3.5 h-3.5" />,
};

function downloadArtifactAsJson(artifact: ProjectArtifact): void {
  const blob = new Blob([JSON.stringify(artifact.output, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${artifact.label.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function groupByStage(artifacts: ProjectArtifact[]): [number, ProjectArtifact[]][] {
  const byStage = new Map<number, ProjectArtifact[]>();
  for (const a of artifacts) {
    const list = byStage.get(a.stage);
    if (list) list.push(a);
    else byStage.set(a.stage, [a]);
  }
  return Array.from(byStage.entries()).sort(([a], [b]) => a - b);
}

// Project-wide artifacts view — every Stage 1-4 output produced across
// EVERY chat in the project (not just whichever one is currently open),
// each tagged with who produced it and where, plus a one-click JSON
// download — the "one artifact section... resources can be downloaded by
// any user" surface. Reachable from ChatWorkspace's project header.
export const ProjectArtifactsModal: React.FC<Props> = ({ projectId, onClose, onOpenChat }) => {
  const [artifacts, setArtifacts] = useState<ProjectArtifact[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    projectsApi
      .listArtifacts(projectId)
      .then((docs) => {
        if (!cancelled) setArtifacts(docs);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load artifacts.");
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const grouped = useMemo(() => groupByStage(artifacts ?? []), [artifacts]);

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-2xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="bg-brand-orange-light border-b border-brand-orange/20 p-4 px-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-brand-orange" />
            <h3 className="font-extrabold text-sm text-slate-900">Project Artifacts</h3>
          </div>
          <button onClick={onClose} title="Close" className="text-slate-400 hover:text-slate-700 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="text-[11px] font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
              {error}
            </div>
          )}
          {!artifacts && !error && (
            <div className="flex items-center justify-center gap-2 py-10 text-xs font-semibold text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading artifacts...
            </div>
          )}
          {artifacts && artifacts.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-10">
              No artifacts yet — they'll show up here as Stage 1-4 tasks complete in any chat in this project.
            </p>
          )}
          {grouped.map(([stage, stageArtifacts]) => (
            <div key={stage}>
              <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
                Stage {stage} · {stageLabel(stage)}
              </div>
              <div className="space-y-1.5">
                {stageArtifacts.map((a) => {
                  const kind = detectArtifactKind(a.output);
                  return (
                    <div
                      key={a.artifact_id}
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors"
                    >
                      <span className="w-7 h-7 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-500 shrink-0">
                        {KIND_ICON[kind]}
                      </span>
                      <div className="flex-1 min-w-0">
                        <button
                          type="button"
                          onClick={() => {
                            onOpenChat(a.chat_id);
                            onClose();
                          }}
                          className="text-xs font-bold text-slate-800 hover:text-brand-orange truncate cursor-pointer text-left"
                          title={`Open in "${a.chat_title}"`}
                        >
                          {a.label}
                        </button>
                        <div className="flex items-center gap-1 text-[10px] text-slate-400 truncate">
                          <User className="w-2.5 h-2.5 shrink-0" />
                          {a.created_by_username}
                          <span className="mx-0.5">·</span>
                          {a.chat_title}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => downloadArtifactAsJson(a)}
                        title="Download as JSON"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-brand-orange hover:bg-brand-orange-light transition-colors cursor-pointer shrink-0"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
