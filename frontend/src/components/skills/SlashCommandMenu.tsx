import React from "react";
import { Sparkles, Terminal, Wrench } from "lucide-react";
import type { Skill } from "../../types";

export type SlashMenuItem = { type: "create-skill" } | { type: "skill"; skill: Skill };

interface Props {
  items: SlashMenuItem[];
  selectedIndex: number;
  onHover: (index: number) => void;
  onSelect: (item: SlashMenuItem) => void;
}

export const SlashCommandMenu: React.FC<Props> = ({ items, selectedIndex, onHover, onSelect }) => {
  if (items.length === 0) return null;

  return (
    <div className="absolute bottom-full left-2 right-2 mb-2 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden z-50 divide-y divide-slate-100">
      <div className="p-2 bg-slate-50 flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
        <span className="flex items-center gap-1.5 text-slate-700 font-extrabold">
          <Terminal className="w-3 h-3 text-brand-orange" />
          Skills ({items.length})
        </span>
        <span className="text-[9px] text-slate-400 font-normal">Use ↑↓ Enter</span>
      </div>

      <div className="max-h-56 overflow-auto p-1 space-y-0.5">
        {items.map((item, idx) => {
          const isSelected = idx === selectedIndex;
          if (item.type === "create-skill") {
            return (
              <button
                key="create-skill"
                onClick={() => onSelect(item)}
                onMouseEnter={() => onHover(idx)}
                className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 transition-all cursor-pointer ${
                  isSelected ? "bg-brand-orange-light text-brand-orange font-bold" : "hover:bg-slate-50 text-slate-700"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-brand-orange shrink-0" />
                <span className="font-mono font-bold text-xs">/create skill</span>
                <span className="text-[10px] text-slate-400 font-medium">Build a new skill from a file or description</span>
              </button>
            );
          }
          const { skill } = item;
          return (
            <button
              key={skill.skill_id}
              onClick={() => onSelect(item)}
              onMouseEnter={() => onHover(idx)}
              className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between gap-3 transition-all cursor-pointer ${
                isSelected ? "bg-brand-orange-light text-brand-orange font-bold" : "hover:bg-slate-50 text-slate-700"
              }`}
            >
              <div className="flex items-center gap-2 truncate min-w-0">
                <Wrench className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="font-mono font-bold text-xs shrink-0">{skill.skill_id}</span>
                <span className="text-xs font-semibold text-slate-800 truncate">{skill.title}</span>
              </div>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase shrink-0">
                {skill.kind}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
