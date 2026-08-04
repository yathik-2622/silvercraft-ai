import React, { useState } from "react";
import { FolderPlus, Rocket } from "lucide-react";
import type { CreateProjectPrompt, ProjectLayer } from "../types";

interface Props {
  prompt: CreateProjectPrompt;
  isSubmitting: boolean;
  error: string | null;
  onCreate: (name: string, domain: string, layer: ProjectLayer) => void;
}

const LAYER_OPTIONS: { value: ProjectLayer; label: string }[] = [
  { value: "silver", label: "Silver — Foundation" },
  { value: "gold", label: "Gold — Product" },
  { value: "bronze", label: "Bronze — Raw" },
];

export const CreateProjectPromptCard: React.FC<Props> = ({ prompt, isSubmitting, error, onCreate }) => {
  const [name, setName] = useState("");
  const [domain, setDomain] = useState(prompt.suggested_domain || "");
  const [layer, setLayer] = useState<ProjectLayer>(prompt.suggested_layer || "silver");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !domain.trim()) return;
    onCreate(name.trim(), domain.trim(), layer);
  };

  return (
    <div className="ml-9.5 max-w-[88%] bg-white border-2 border-dashed border-brand-orange rounded-2xl p-4 space-y-3 shadow-2xs">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-brand-orange-light text-brand-orange flex items-center justify-center shrink-0 border border-brand-orange/20">
          <FolderPlus className="w-4 h-4" />
        </div>
        <span className="text-xs font-extrabold text-slate-900">Create a project to continue</span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-2.5">
        <div>
          <label className="text-[10px] font-bold text-slate-600 block mb-1">Project Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Lakehouse Foundation Model"
            autoFocus
            className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-600 block mb-1">Domain</label>
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="e.g. Retail & E-Commerce"
            className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-600 block mb-1">Layer</label>
          <select
            value={layer}
            onChange={(e) => setLayer(e.target.value as ProjectLayer)}
            className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange cursor-pointer"
          >
            {LAYER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div className="text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting || !name.trim() || !domain.trim()}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-brand-orange hover:bg-brand-orange-hover disabled:opacity-50 text-white font-extrabold text-xs shadow-2xs transition-all cursor-pointer"
        >
          <Rocket className="w-3.5 h-3.5" />
          <span>{isSubmitting ? "Creating..." : "Create Project & Continue"}</span>
        </button>
      </form>
    </div>
  );
};
