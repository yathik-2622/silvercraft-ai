import { useMemo, useState } from 'react';
import { Check, Save } from 'lucide-react';

export type CanvasArtifact = { id: string; title: string; stage: string; content: string; status: 'awaiting_hitl' | 'approved' };

const decode = (content: string) => {
  try { return JSON.parse(content.replace(/^```json\s*|\s*```$/g, '')); } catch { return null; }
};

const values = (data: any, names: string[]) => names.flatMap((name) => {
  const value = data?.[name];
  return Array.isArray(value) ? value : value && typeof value === 'object' ? Object.entries(value).map(([key, item]) => ({ name: key, ...(item as object) })) : [];
});

export const StructuredCanvas = ({ artifact, view, onSave }: { artifact?: CanvasArtifact; view: 'erd' | 'attributes' | 'sttm'; onSave: (content: string) => void }) => {
  const initial = useMemo(() => artifact ? decode(artifact.content) : null, [artifact]);
  const [draft, setDraft] = useState<any>(initial);
  const [dirty, setDirty] = useState(false);
  if (!artifact) return <div className="grid flex-1 place-items-center p-8 text-center text-sm text-slate-500">A structured stage output will appear here after an agent completes work.</div>;
  if (!initial) return <div className="grid flex-1 place-items-center p-8 text-center text-sm text-slate-500">This legacy artifact is prose. Regenerate it to receive the ADM structured canvas format.</div>;

  const tables = values(draft, ['tables', 'entities', 'concepts']);
  const relationships = values(draft, ['relationships']);
  const sttm = values(draft, ['sttm', 'mappings', 'sttm_rows']);
  const commit = () => { onSave(JSON.stringify(draft, null, 2)); setDirty(false); };
  const rename = (index: number, name: string) => {
    const key = draft.tables ? 'tables' : draft.entities ? 'entities' : 'concepts';
    if (draft[key] && !Array.isArray(draft[key])) {
      const entries = Object.entries(draft[key]); const [old, value] = entries[index] as [string, any];
      delete draft[key][old]; draft[key][name] = value;
    } else if (tables[index]) tables[index].name = name;
    setDraft({ ...draft }); setDirty(true);
  };

  return <div className="min-h-0 flex-1 overflow-auto bg-[#faf7f2] p-4">
    <div className="mb-3 flex items-center justify-between rounded-xl border border-[#ece6da] bg-white px-3 py-2">
      <div><div className="text-xs font-bold text-slate-900">{artifact.title}</div><div className="text-[11px] text-slate-500">{artifact.stage.replaceAll('-', ' ')}</div></div>
      <div className="flex items-center gap-2">{dirty && <span className="rounded-full bg-[#ffe7da] px-2 py-1 text-[10px] font-bold text-[#d93c0a]">Unsaved changes</span>}<button onClick={commit} disabled={!dirty} className="inline-flex items-center gap-1 rounded-lg bg-[#e67225] px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-40"><Save className="h-3.5 w-3.5" />Save</button></div>
    </div>
    {view === 'erd' ? <div className="relative grid min-w-[620px] grid-cols-2 gap-4 p-3">
      {tables.map((table: any, index: number) => <article key={`${table.name}-${index}`} className="rounded-xl border border-[#ece6da] bg-white shadow-sm">
        <div className={`flex items-center justify-between px-3 py-2 ${table.role === 'FACT' ? 'bg-slate-900 text-white' : 'bg-[#ffe7da] text-[#d93c0a]'}`}><input value={table.name || table.table_name || `Entity ${index + 1}`} onChange={(event) => rename(index, event.target.value)} className="w-4/5 bg-transparent text-xs font-bold outline-none" /><span className="text-[10px]">{table.role || table.domain || 'TABLE'}</span></div>
        <div className="space-y-1 px-3 py-2 text-[11px] text-slate-600">{values(table, ['columns', 'attributes', 'dictionary']).slice(0, 7).map((column: any, columnIndex) => <div key={columnIndex} className="flex justify-between gap-2"><span>{column.name || column.column_name || column.attribute || String(column)}</span><span className="text-slate-400">{column.data_type || column.type || ''}</span></div>)}</div>
      </article>)}
      {relationships.length > 0 && <div className="col-span-2 rounded-xl border border-dashed border-[#e67225]/40 bg-white/70 p-3 text-xs text-slate-600">Relationships: {relationships.map((item: any) => `${item.child || item.source || item.from} → ${item.parent || item.target || item.to} ${item.cardinality || ''}`).join(' · ')}</div>}
    </div> : view === 'sttm' ? <div className="overflow-x-auto rounded-xl border border-[#ece6da] bg-white"><table className="w-full text-left text-xs"><thead className="bg-[#faf7f2] text-slate-500"><tr>{['Source', 'Target', 'Type', 'Mapping expression'].map((label) => <th key={label} className="px-3 py-2 font-semibold">{label}</th>)}</tr></thead><tbody>{sttm.map((row: any, index: number) => <tr key={index} className="border-t border-[#ece6da]"><td className="px-3 py-2">{row.source || row.src_table || row.source_column}</td><td className="px-3 py-2 font-semibold">{row.target || row.tgt_table || row.target_column}</td><td className="px-3 py-2">{row.data_type || row.type}</td><td className="px-3 py-2 font-mono text-[#d93c0a]">{row.expression || row.mapping_expression}</td></tr>)}</tbody></table></div> : <div className="overflow-x-auto rounded-xl border border-[#ece6da] bg-white"><table className="w-full text-left text-xs"><thead className="bg-[#faf7f2] text-slate-500"><tr>{['Entity', 'Attribute', 'Type', 'PK/FK', 'Classification'].map((label) => <th key={label} className="px-3 py-2 font-semibold">{label}</th>)}</tr></thead><tbody>{tables.flatMap((table: any) => values(table, ['columns', 'attributes', 'dictionary']).map((column: any, index: number) => <tr key={`${table.name}-${index}`} className="border-t border-[#ece6da]"><td className="px-3 py-2 font-semibold">{table.name}</td><td className="px-3 py-2">{column.name || column.column_name || column.attribute}</td><td className="px-3 py-2">{column.data_type || column.type}</td><td className="px-3 py-2">{column.primary_key ? <Check className="h-3.5 w-3.5 text-[#e67225]" /> : column.foreign_key ? 'FK' : ''}</td><td className="px-3 py-2">{column.classification || column.sensitivity || ''}</td></tr>))}</tbody></table></div>}
  </div>;
};
