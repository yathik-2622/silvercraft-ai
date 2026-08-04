import React from "react";

interface Props {
  output: Record<string, unknown>;
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

/**
 * Task outputs are whatever shape the skill that produced them returned —
 * the backend intentionally keeps `output` as a free-form dict rather than
 * a fixed schema per stage. Renders record-arrays as tables, flat objects
 * as key/value rows, recursing one level for nested arrays/objects.
 */
export const TaskOutputRenderer: React.FC<Props> = ({ output }) => {
  const entries = Object.entries(output);

  return (
    <div className="space-y-3">
      {entries.map(([key, value]) => {
        if (isRecordArray(value)) {
          const columns = Array.from(new Set(value.flatMap((row) => Object.keys(row))));
          return (
            <div key={key}>
              <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                {humanizeKey(key)}
              </div>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
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
                    {value.map((row, idx) => (
                      <tr key={idx}>
                        {columns.map((c) => (
                          <td key={c} className="px-2 py-1.5 text-slate-700 whitespace-nowrap">
                            {formatValue(row[c])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        }

        if (Array.isArray(value)) {
          return (
            <div key={key}>
              <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                {humanizeKey(key)}
              </div>
              <div className="flex flex-wrap gap-1">
                {value.map((item, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[11px] font-semibold text-slate-700"
                  >
                    {formatValue(item)}
                  </span>
                ))}
              </div>
            </div>
          );
        }

        if (typeof value === "object" && value !== null) {
          return (
            <div key={key}>
              <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                {humanizeKey(key)}
              </div>
              <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
                {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
                  <div key={k} className="flex items-start justify-between gap-3 px-2.5 py-1.5 text-[11px]">
                    <span className="font-semibold text-slate-500 shrink-0">{humanizeKey(k)}</span>
                    <span className="text-slate-800 text-right">{formatValue(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        }

        return (
          <div key={key} className="flex items-start justify-between gap-3 text-[11px]">
            <span className="font-semibold text-slate-500 shrink-0">{humanizeKey(key)}</span>
            <span className="text-slate-800 text-right">{formatValue(value)}</span>
          </div>
        );
      })}

      {entries.length === 0 && <p className="text-[11px] text-slate-400">No output fields.</p>}
    </div>
  );
};
