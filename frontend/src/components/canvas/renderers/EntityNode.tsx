import React from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { KeyRound, Link2 } from "lucide-react";

export interface EntityAttributeRow {
  name: string;
  type?: string;
  isPk?: boolean;
  isFk?: boolean;
  description?: string;
}

export interface EntityNodeData {
  title: string;
  rows: EntityAttributeRow[];
}

export const EntityNode: React.FC<NodeProps<EntityNodeData>> = ({ data, selected }) => {
  return (
    <div
      className={`w-64 rounded-xl border-2 bg-white shadow-sm overflow-hidden transition-all ${
        selected ? "border-brand-orange shadow-md" : "border-slate-200"
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-slate-300 !w-2 !h-2" />
      <div className="px-3 py-2 bg-brand-orange-light border-b border-brand-orange/20">
        <span className="text-xs font-black text-slate-900 truncate block">{data.title}</span>
      </div>
      <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
        {data.rows.map((row, idx) => (
          <div key={`${row.name}-${idx}`} className="px-3 py-1.5 flex items-center justify-between gap-2 text-[11px]">
            <div className="min-w-0 flex items-center gap-1">
              {row.isPk && (
                <span title="Primary key" className="shrink-0">
                  <KeyRound className="w-2.5 h-2.5 text-amber-500" />
                </span>
              )}
              {row.isFk && (
                <span title="Foreign key" className="shrink-0">
                  <Link2 className="w-2.5 h-2.5 text-blue-500" />
                </span>
              )}
              <span className="font-semibold text-slate-800 truncate" title={row.description}>
                {row.name}
              </span>
            </div>
            {row.type && <span className="text-[9px] font-mono text-slate-400 shrink-0 truncate max-w-[90px]">{row.type}</span>}
          </div>
        ))}
        {data.rows.length === 0 && <div className="px-3 py-2 text-[11px] text-slate-400">No attributes.</div>}
      </div>
      <Handle type="source" position={Position.Right} className="!bg-slate-300 !w-2 !h-2" />
    </div>
  );
};
