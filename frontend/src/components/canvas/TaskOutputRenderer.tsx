import React from "react";

interface Props {
  output: unknown;
}

function isRecordArray(value: unknown): value is Record<string, unknown>[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((v) => typeof v === "object" && v !== null && !Array.isArray(v))
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function humanizeKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Renders a record array as a real table — extracted so both a top-level
 * array output (most real skill outputs — see detectArtifactKind's "table"
 * shapes) and a record-array nested under a key can share the exact same
 * rendering. `compact` shrinks padding/caps height for nested use inside a
 * table cell, so a nested table doesn't blow out the parent row's height.
 * Exported — SourcePreviewModal.tsx reuses it directly for CSV/XLSX KB
 * document table previews, one table visual language everywhere in the app. */
export const RecordArrayTable: React.FC<{ rows: Record<string, unknown>[]; compact?: boolean }> = ({ rows, compact }) => {
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  return (
    <div className={`overflow-x-auto rounded-lg border border-slate-200 ${compact ? "max-h-32 overflow-y-auto" : ""}`}>
      <table className="w-full text-[11px]">
        <thead className="bg-slate-50">
          <tr>
            {columns.map((c) => (
              <th key={c} className="text-left px-2 py-1.5 font-bold text-slate-600 whitespace-nowrap">
                {humanizeKey(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, idx) => (
            <tr key={idx}>
              {columns.map((c) => (
                <td key={c} className="px-2 py-1.5 text-slate-700 align-top">
                  {renderCellValue(row[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/** Chip-list rendering for a plain (non-record) array — shared by the
 * nested-cell case and the top-level object-entries case. */
const ChipList: React.FC<{ items: unknown[] }> = ({ items }) => (
  <div className="flex flex-wrap gap-1">
    {items.map((item, idx) => (
      <span
        key={idx}
        className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[11px] font-semibold text-slate-700"
      >
        {formatValue(item)}
      </span>
    ))}
  </div>
);

/** Key/value row rendering for a plain object — shared by the nested-cell
 * case and the top-level object-entries case. */
const KeyValueRows: React.FC<{ obj: Record<string, unknown> }> = ({ obj }) => (
  <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
    {Object.entries(obj).map(([k, v]) => (
      <div key={k} className="flex items-start justify-between gap-3 px-2.5 py-1.5 text-[11px]">
        <span className="font-semibold text-slate-500 shrink-0">{humanizeKey(k)}</span>
        <span className="text-slate-800 text-right">{formatValue(v)}</span>
      </div>
    ))}
  </div>
);

/**
 * Single recursive entry point for "how do I render one value, whatever
 * its shape" — used both for a table CELL's content and (via the wrapper
 * components below) for a top-level object's entries. Previously
 * RecordArrayTable's per-cell rendering only ever called formatValue(),
 * which JSON.stringify's any object/array — so a nested array-within-a-row
 * (e.g. profile_source's per-table `columns` array) rendered as a raw
 * JSON string instead of a real nested table. This is the fix: every
 * value, at every level, goes through the same shape-dispatch.
 */
function renderCellValue(value: unknown): React.ReactNode {
  if (isRecordArray(value)) return <RecordArrayTable rows={value} compact />;
  if (Array.isArray(value)) return value.length === 0 ? "—" : <ChipList items={value} />;
  if (typeof value === "object" && value !== null) return <KeyValueRows obj={value as Record<string, unknown>} />;
  return formatValue(value);
}

/**
 * Task outputs are whatever shape the skill that produced them returned —
 * the backend intentionally keeps `output` as a free-form dict rather than
 * a fixed schema per stage. Renders record-arrays as tables, flat objects
 * as key/value rows, recursing for nested arrays/objects at any depth via
 * renderCellValue (not just one level, unlike the earlier version).
 *
 * Most real skill outputs are a TOP-LEVEL array (profile_source,
 * classify_sensitivity, generate_sttm, relationship rows) — Object.entries
 * on an array would otherwise render one numbered section per index
 * instead of a single table, so that shape is handled first, directly.
 */
export const TaskOutputRenderer: React.FC<Props> = ({ output }) => {
  if (isRecordArray(output)) {
    return <RecordArrayTable rows={output} />;
  }

  const entries = Object.entries((output ?? {}) as Record<string, unknown>);

  return (
    <div className="space-y-3">
      {entries.map(([key, value]) => {
        // Scalars stay a compact single-line "Label   Value" row (original
        // layout) — only array/object values get the standalone
        // uppercase-header-then-block treatment, since a header line above
        // a single number/string reads as visual noise.
        const isCompound = (typeof value === "object" && value !== null) || Array.isArray(value);
        if (!isCompound) {
          return (
            <div key={key} className="flex items-start justify-between gap-3 text-[11px]">
              <span className="font-semibold text-slate-500 shrink-0">{humanizeKey(key)}</span>
              <span className="text-slate-800 text-right">{formatValue(value)}</span>
            </div>
          );
        }
        return (
          <div key={key}>
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
              {humanizeKey(key)}
            </div>
            {renderCellValue(value)}
          </div>
        );
      })}

      {entries.length === 0 && <p className="text-[11px] text-slate-400">No output fields.</p>}
    </div>
  );
};
