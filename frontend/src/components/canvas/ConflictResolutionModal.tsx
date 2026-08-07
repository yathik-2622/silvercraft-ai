import React from "react";
import { AlertTriangle, Check, X } from "lucide-react";
import { formatValue, humanizeKey } from "./TaskOutputRenderer";

interface Props {
  myDraftOutput: Record<string, unknown> | unknown[];
  theirOutput: unknown;
  theirUsername: string;
  theirTimestamp: string;
  onTakeTheirs: () => void;
  onKeepMine: () => void;
  onCancel: () => void;
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diffMin = Math.floor((Date.now() - then) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface DictDiff {
  added: Record<string, unknown>;
  removed: Record<string, unknown>;
  changed: Record<string, { before: unknown; after: unknown }>;
}

// JS port of app/tools/diff_tool.py::ADM_dict_diff — same shallow
// added/removed/changed shape, so a reader familiar with the backend's own
// HITL-edit-review diff recognizes this immediately. Only meaningful for
// two plain objects; a caller with array/mismatched-shape output falls
// back to a whole-value before/after instead (see DiffBody below).
function dictDiff(a: Record<string, unknown>, b: Record<string, unknown>): DictDiff {
  const added: Record<string, unknown> = {};
  const removed: Record<string, unknown> = {};
  const changed: Record<string, { before: unknown; after: unknown }> = {};
  for (const k of Object.keys(b)) if (!(k in a)) added[k] = b[k];
  for (const k of Object.keys(a)) if (!(k in b)) removed[k] = a[k];
  for (const k of Object.keys(a)) {
    if (k in b && JSON.stringify(a[k]) !== JSON.stringify(b[k])) changed[k] = { before: a[k], after: b[k] };
  }
  return { added, removed, changed };
}

const DiffBody: React.FC<{ mine: unknown; theirs: unknown }> = ({ mine, theirs }) => {
  if (!isPlainObject(mine) || !isPlainObject(theirs)) {
    // Array-shaped or otherwise non-dict output — no per-field diff, just
    // show both whole values (still better than nothing, and this shape
    // is uncommon for HITL-edited tasks).
    return (
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div>
          <div className="font-black uppercase tracking-wider text-slate-400 text-[10px] mb-1">Your draft</div>
          <pre className="whitespace-pre-wrap break-words bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-700">
            {formatValue(mine)}
          </pre>
        </div>
        <div>
          <div className="font-black uppercase tracking-wider text-slate-400 text-[10px] mb-1">Their version</div>
          <pre className="whitespace-pre-wrap break-words bg-emerald-50 border border-emerald-200 rounded-lg p-2 text-slate-700">
            {formatValue(theirs)}
          </pre>
        </div>
      </div>
    );
  }

  const diff = dictDiff(mine, theirs);
  const hasChanges = Object.keys(diff.added).length + Object.keys(diff.removed).length + Object.keys(diff.changed).length > 0;

  if (!hasChanges) {
    return <p className="text-[11px] text-slate-400">No field-level differences — the values matched.</p>;
  }

  return (
    <div className="space-y-1.5 text-[11px]">
      {Object.entries(diff.changed).map(([key, { before, after }]) => (
        <div key={key} className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5">
          <div className="font-bold text-amber-800">{humanizeKey(key)}</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="line-through text-slate-500">{formatValue(before)}</span>
            <span className="text-slate-400">→</span>
            <span className="font-semibold text-emerald-700">{formatValue(after)}</span>
          </div>
        </div>
      ))}
      {Object.entries(diff.added).map(([key, value]) => (
        <div key={key} className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5">
          <span className="font-bold text-emerald-800">+ {humanizeKey(key)}:</span>{" "}
          <span className="text-slate-700">{formatValue(value)}</span>
        </div>
      ))}
      {Object.entries(diff.removed).map(([key, value]) => (
        <div key={key} className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5">
          <span className="font-bold text-rose-800">− {humanizeKey(key)}:</span>{" "}
          <span className="text-slate-500 line-through">{formatValue(value)}</span>
        </div>
      ))}
    </div>
  );
};

// Shown when ADM_hitl_edit rejects a save with 409 — a collaborator saved
// a newer revision of the same task after this edit started. Contracts
// are shared per-project (see ADM_ExecutionContract's backend module
// note), so this is the merge point the "take theirs / keep mine" request
// actually needed, scoped to one task's output rather than the whole model.
export const ConflictResolutionModal: React.FC<Props> = ({
  myDraftOutput,
  theirOutput,
  theirUsername,
  theirTimestamp,
  onTakeTheirs,
  onKeepMine,
  onCancel,
}) => (
  <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-2xs flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden">
      <div className="bg-amber-50 border-b border-amber-200 p-4 px-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          <h3 className="font-extrabold text-sm text-slate-900">Someone else edited this first</h3>
        </div>
        <button onClick={onCancel} title="Close" className="text-slate-400 hover:text-slate-700 cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-3">
        <p className="text-[11px] text-slate-600">
          Last modified by <span className="font-bold text-slate-800">{theirUsername}</span>,{" "}
          {formatRelativeTime(theirTimestamp)} — while you were editing. Review the difference below.
        </p>

        <DiffBody mine={myDraftOutput} theirs={theirOutput} />

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onKeepMine}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
          >
            Keep continuing mine
          </button>
          <button
            type="button"
            onClick={onTakeTheirs}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-brand-orange hover:bg-brand-orange-hover text-white font-bold text-xs cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            Take their version
          </button>
        </div>
      </div>
    </div>
  </div>
);
