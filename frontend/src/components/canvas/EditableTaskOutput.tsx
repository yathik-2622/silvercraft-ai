import React from "react";
import { isRecordArray, renderCellValue, humanizeKey, formatValue } from "./TaskOutputRenderer";

interface Props {
  output: Record<string, unknown> | Record<string, unknown>[];
  onChange: (next: Record<string, unknown> | Record<string, unknown>[]) => void;
}

// Auto-sizing text field — a single-line <input> for short values, a
// <textarea> for anything long enough that a single line would truncate
// it (e.g. a "Rationale" column). Threshold matches what already reads as
// "too long for one line" elsewhere in this app's tables.
const EditableCell: React.FC<{ value: unknown; onChange: (v: unknown) => void }> = ({ value, onChange }) => {
  if (typeof value === "number") {
    return (
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        className="w-24 px-1.5 py-1 bg-white border border-slate-200 rounded-md text-[11px] text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange"
      />
    );
  }
  if (typeof value === "boolean") {
    return (
      <select
        value={value ? "true" : "false"}
        onChange={(e) => onChange(e.target.value === "true")}
        className="px-1.5 py-1 bg-white border border-slate-200 rounded-md text-[11px] text-slate-800 focus:outline-none cursor-pointer"
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }
  const strValue = typeof value === "string" ? value : formatValue(value);
  if (strValue.length > 40) {
    return (
      <textarea
        value={strValue}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="w-full min-w-[180px] px-1.5 py-1 bg-white border border-slate-200 rounded-md text-[11px] text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange resize-y"
      />
    );
  }
  return (
    <input
      type="text"
      value={strValue}
      onChange={(e) => onChange(e.target.value)}
      className="w-full min-w-[100px] px-1.5 py-1 bg-white border border-slate-200 rounded-md text-[11px] text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange"
    />
  );
};

/** Same visual table every read-only view uses, but every scalar cell is a
 * real input — editing "in the same format" instead of a raw JSON blob
 * (Phase: HITL review). Nested arrays/objects within a cell stay read-only
 * (renderCellValue, unchanged) — editing arbitrarily-deep nested structure
 * inline isn't worth the complexity; the common HITL-reviewed shapes
 * (candidate relationships, data dictionary rows, profiling columns) are
 * flat records, and users can still see nested detail, just not edit it
 * cell-by-cell at that depth. */
const EditableRecordArrayTable: React.FC<{
  rows: Record<string, unknown>[];
  onChange: (rows: Record<string, unknown>[]) => void;
}> = ({ rows, onChange }) => {
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));

  const updateCell = (rowIdx: number, col: string, value: unknown) => {
    const next = rows.map((row, i) => (i === rowIdx ? { ...row, [col]: value } : row));
    onChange(next);
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-xs">
        <thead className="bg-slate-50">
          <tr>
            {columns.map((c) => (
              <th key={c} className="text-left px-3 py-2.5 font-bold text-slate-600 whitespace-nowrap border-b border-slate-200">
                {humanizeKey(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, rowIdx) => (
            <tr key={rowIdx}>
              {columns.map((c) => {
                const value = row[c];
                const isEditableScalar = value === null || value === undefined || typeof value !== "object";
                return (
                  <td key={c} className="px-3 py-2 text-slate-700 align-top">
                    {isEditableScalar ? (
                      <EditableCell value={value} onChange={(v) => updateCell(rowIdx, c, v)} />
                    ) : (
                      renderCellValue(value)
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/** Editable counterpart to TaskOutputRenderer's per-table-array detection
 * — one editable table per source table, table_name/meta fields shown but
 * not editable (renaming a table mid-review isn't a real use case here). */
function isPerTableArray(value: unknown): value is Record<string, unknown>[] {
  if (!isRecordArray(value)) return false;
  return (
    value.every((row) => typeof row.table_name === "string") &&
    value.some((row) => Object.values(row).some((v) => isRecordArray(v)))
  );
}

const EditablePerTableSections: React.FC<{
  rows: Record<string, unknown>[];
  onChange: (rows: Record<string, unknown>[]) => void;
}> = ({ rows, onChange }) => (
  <div className="space-y-4">
    {rows.map((row, rowIdx) => {
      const nestedArrayEntry = Object.entries(row).find(([, v]) => isRecordArray(v)) as
        | [string, Record<string, unknown>[]]
        | undefined;
      const metaEntries = Object.entries(row).filter(
        ([k]) => k !== "table_name" && (!nestedArrayEntry || k !== nestedArrayEntry[0]),
      );
      return (
        <div key={rowIdx} className="rounded-xl border border-slate-200 overflow-hidden">
          <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex items-center justify-between flex-wrap gap-x-4 gap-y-1">
            <h4 className="text-xs font-extrabold text-slate-900">{String(row.table_name)}</h4>
            <div className="flex items-center gap-3 text-[10px] text-slate-500 font-semibold">
              {metaEntries.map(([k, v]) => (
                <span key={k}>
                  {humanizeKey(k)}: <span className="text-slate-700">{formatValue(v)}</span>
                </span>
              ))}
            </div>
          </div>
          <div className="p-2">
            {nestedArrayEntry ? (
              <EditableRecordArrayTable
                rows={nestedArrayEntry[1]}
                onChange={(newDetailRows) => {
                  const next = rows.map((r, i) => (i === rowIdx ? { ...r, [nestedArrayEntry[0]]: newDetailRows } : r));
                  onChange(next);
                }}
              />
            ) : (
              <p className="text-[11px] text-slate-400 p-2">No detail rows.</p>
            )}
          </div>
        </div>
      );
    })}
  </div>
);

/** Top-level entry point — mirrors TaskOutputRenderer's own dispatch
 * (per-table array / record array / object-entries) but every scalar leaf
 * is a real editable field instead of static text, and top-level scalar
 * object fields get an inline input on the same compact row instead of a
 * JSON textarea. Replaces ArtifactHitlWrapper's raw
 * JSON.stringify/JSON.parse editing entirely. */
export const EditableTaskOutput: React.FC<Props> = ({ output, onChange }) => {
  if (isPerTableArray(output)) {
    return <EditablePerTableSections rows={output} onChange={(rows) => onChange(rows)} />;
  }
  if (isRecordArray(output)) {
    return <EditableRecordArrayTable rows={output} onChange={(rows) => onChange(rows)} />;
  }

  const obj = (output ?? {}) as Record<string, unknown>;
  const entries = Object.entries(obj);

  const updateField = (key: string, value: unknown) => onChange({ ...obj, [key]: value });

  return (
    <div className="space-y-3">
      {entries.map(([key, value]) => {
        const isCompound = (typeof value === "object" && value !== null) || Array.isArray(value);
        if (!isCompound) {
          return (
            <div key={key} className="flex items-center justify-between gap-3 text-[11px]">
              <span className="font-semibold text-slate-500 shrink-0">{humanizeKey(key)}</span>
              <div className="flex-1 flex justify-end">
                <EditableCell value={value} onChange={(v) => updateField(key, v)} />
              </div>
            </div>
          );
        }
        return (
          <div key={key}>
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">{humanizeKey(key)}</div>
            {isPerTableArray(value) ? (
              <EditablePerTableSections rows={value} onChange={(rows) => updateField(key, rows)} />
            ) : isRecordArray(value) ? (
              <EditableRecordArrayTable rows={value} onChange={(rows) => updateField(key, rows)} />
            ) : (
              renderCellValue(value)
            )}
          </div>
        );
      })}
      {entries.length === 0 && <p className="text-[11px] text-slate-400">No output fields.</p>}
    </div>
  );
};
