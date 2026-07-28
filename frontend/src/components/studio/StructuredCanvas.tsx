import { useMemo, useState } from 'react';
import { Check, Save, Database, GitMerge } from 'lucide-react';
import ReactFlow, { Background, Controls, Handle, Position, MarkerType, useNodesState, useEdgesState } from 'reactflow';
import 'reactflow/dist/style.css';
import { projectsApi, sessionsApi } from '../../api/client';

export type CanvasArtifact = { id: string; title: string; stage: string; content: string; status: 'awaiting_hitl' | 'approved' };

const decode = (content: string) => {
  try { return JSON.parse(content.replace(/^```json\s*|\s*```$/g, '')); } catch { return null; }
};

const values = (data: any, names: string[]) => names.flatMap((name) => {
  const value = data?.[name];
  return Array.isArray(value) ? value : value && typeof value === 'object' ? Object.entries(value).map(([key, item]) => ({ name: key, ...(item as object) })) : [];
});

const TableNode = ({ data }: any) => (
  <div className="rounded-xl border border-[#ece6da] bg-white shadow-lg min-w-[200px]">
    <Handle type="target" position={Position.Top} className="!bg-[#e67225]" />
    <div className={`flex items-center justify-between px-3 py-2 rounded-t-xl ${data.role === 'FACT' ? 'bg-slate-900 text-white' : 'bg-[#ffe7da] text-[#d93c0a]'}`}>
      <span className="text-xs font-bold">{data.name}</span>
      <span className="text-[10px]">{data.role || 'TABLE'}</span>
    </div>
    <div className="space-y-1 px-3 py-2 text-[11px] text-slate-600 bg-white rounded-b-xl">
      {data.columns.slice(0, 7).map((col: any, idx: number) => (
        <div key={idx} className="flex justify-between gap-4">
          <span className="font-medium">{col.name}</span>
          <span className="text-slate-400">{col.type}</span>
        </div>
      ))}
      {data.columns.length > 7 && <div className="text-center text-slate-400 italic">+{data.columns.length - 7} more</div>}
    </div>
    <Handle type="source" position={Position.Bottom} className="!bg-[#e67225]" />
  </div>
);

const nodeTypes = { tableNode: TableNode };

export const StructuredCanvas = ({ artifact, view, onSave, projectId, chatId }: { artifact?: CanvasArtifact; view: 'erd' | 'attributes' | 'sttm'; onSave: (content: string) => void; projectId?: string; chatId?: string }) => {
  const initial = useMemo(() => artifact ? decode(artifact.content) : null, [artifact]);
  const [draft, setDraft] = useState<any>(initial);
  const [dirty, setDirty] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [showGitModal, setShowGitModal] = useState(false);
  const [gitRepo, setGitRepo] = useState('');
  const [gitBranch, setGitBranch] = useState('main');

  if (!artifact) return <div className="grid flex-1 place-items-center p-8 text-center text-sm text-slate-500">A structured stage output will appear here after an agent completes work.</div>;
  if (!initial) return <div className="grid flex-1 place-items-center p-8 text-center text-sm text-slate-500">This legacy artifact is prose. Regenerate it to receive the ADM structured canvas format.</div>;

  const tables = values(draft, ['tables', 'entities', 'concepts']);
  const relationships = values(draft, ['relationships']);
  const sttm = values(draft, ['sttm', 'mappings', 'sttm_rows']);
  
  // React Flow setup
  const initialNodes = tables.map((t: any, i: number) => ({
    id: t.name || `table_${i}`,
    type: 'tableNode',
    position: { x: 50 + (i % 3) * 250, y: 50 + Math.floor(i / 3) * 200 },
    data: { 
      name: t.name || t.table_name || `Entity ${i + 1}`, 
      role: t.role || t.domain || 'TABLE',
      columns: values(t, ['columns', 'attributes', 'dictionary']).map((c: any) => ({ name: c.name || c.column_name || c.attribute, type: c.data_type || c.type }))
    }
  }));

  const initialEdges = relationships.map((r: any, i: number) => ({
    id: `e${i}`,
    source: r.source || r.from || r.parent,
    target: r.target || r.to || r.child,
    label: r.cardinality || '',
    markerEnd: { type: MarkerType.ArrowClosed, color: '#e67225' },
    style: { stroke: '#e67225', strokeWidth: 2 },
    animated: true,
  })).filter((e: any) => e.source && e.target);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const commit = () => { onSave(JSON.stringify(draft, null, 2)); setDirty(false); };
  
  const handlePushGit = async () => {
    if (!projectId || !gitRepo) return;
    setPushing(true);
    try {
      await projectsApi.pushToGithub(projectId, gitRepo, gitBranch, ['ddl', 'sttm', 'json_model']);
      alert('Successfully pushed to GitHub!');
      setShowGitModal(false);
    } catch (e: any) {
      alert('Failed to push: ' + (e.response?.data?.detail || e.message));
    } finally {
      setPushing(false);
    }
  };

  const handlePushMetastore = async () => {
    if (!chatId) return;
    setPushing(true);
    try {
      await sessionsApi.pushToMetastore(chatId);
      alert('Queued deployment to Metastore!');
    } catch (e: any) {
      alert('Failed: ' + (e.response?.data?.detail || e.message));
    } finally {
      setPushing(false);
    }
  };

  const isPhysical = artifact.stage.includes('physical');

  return <div className="min-h-0 flex-1 overflow-auto bg-[#faf7f2] p-4 flex flex-col relative">
    <div className="mb-3 flex items-center justify-between rounded-xl border border-[#ece6da] bg-white px-3 py-2 z-10">
      <div><div className="text-xs font-bold text-slate-900">{artifact.title}</div><div className="text-[11px] text-slate-500">{artifact.stage.replaceAll('-', ' ')}</div></div>
      <div className="flex items-center gap-2">
        {isPhysical && (
          <>
            <button onClick={() => setShowGitModal(true)} disabled={pushing} className="inline-flex items-center gap-1 rounded-lg border border-[#ece6da] bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"><GitMerge className="h-3.5 w-3.5" />Push to Git</button>
            <button onClick={handlePushMetastore} disabled={pushing} className="inline-flex items-center gap-1 rounded-lg border border-[#ece6da] bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"><Database className="h-3.5 w-3.5" />Metastore</button>
          </>
        )}
        {dirty && <span className="rounded-full bg-[#ffe7da] px-2 py-1 text-[10px] font-bold text-[#d93c0a]">Unsaved changes</span>}
        <button onClick={commit} disabled={!dirty} className="inline-flex items-center gap-1 rounded-lg bg-[#e67225] px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-40"><Save className="h-3.5 w-3.5" />Save</button>
      </div>
    </div>
    
    {showGitModal && (
      <div className="absolute top-16 right-4 z-50 w-64 rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
        <h3 className="text-xs font-bold mb-2">Push to GitHub</h3>
        <input placeholder="Repo name (e.g. data-models)" value={gitRepo} onChange={e => setGitRepo(e.target.value)} className="w-full text-xs border rounded p-1.5 mb-2" />
        <input placeholder="Branch (e.g. main)" value={gitBranch} onChange={e => setGitBranch(e.target.value)} className="w-full text-xs border rounded p-1.5 mb-2" />
        <div className="flex justify-end gap-2">
          <button onClick={() => setShowGitModal(false)} className="text-xs text-slate-500 hover:text-slate-800">Cancel</button>
          <button onClick={handlePushGit} disabled={pushing || !gitRepo} className="bg-[#e67225] text-white text-xs px-2 py-1 rounded font-bold disabled:opacity-50">{pushing ? 'Pushing...' : 'Push'}</button>
        </div>
      </div>
    )}

    {view === 'erd' ? (
      <div className="flex-1 min-h-[400px] bg-white rounded-xl border border-[#ece6da]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          attributionPosition="bottom-left"
        >
          <Background color="#ece6da" gap={16} />
          <Controls />
        </ReactFlow>
      </div>
    ) : view === 'sttm' ? (
      <div className="overflow-x-auto rounded-xl border border-[#ece6da] bg-white"><table className="w-full text-left text-xs"><thead className="bg-[#faf7f2] text-slate-500"><tr>{['Source', 'Target', 'Type', 'Mapping expression'].map((label) => <th key={label} className="px-3 py-2 font-semibold">{label}</th>)}</tr></thead><tbody>{sttm.map((row: any, index: number) => <tr key={index} className="border-t border-[#ece6da]"><td className="px-3 py-2">{row.source || row.src_table || row.source_column}</td><td className="px-3 py-2 font-semibold">{row.target || row.tgt_table || row.target_column}</td><td className="px-3 py-2">{row.data_type || row.type}</td><td className="px-3 py-2 font-mono text-[#d93c0a]">{row.expression || row.mapping_expression}</td></tr>)}</tbody></table></div>
    ) : (
      <div className="overflow-x-auto rounded-xl border border-[#ece6da] bg-white"><table className="w-full text-left text-xs"><thead className="bg-[#faf7f2] text-slate-500"><tr>{['Entity', 'Attribute', 'Type', 'PK/FK', 'Classification'].map((label) => <th key={label} className="px-3 py-2 font-semibold">{label}</th>)}</tr></thead><tbody>{tables.flatMap((table: any) => values(table, ['columns', 'attributes', 'dictionary']).map((column: any, index: number) => <tr key={`${table.name}-${index}`} className="border-t border-[#ece6da]"><td className="px-3 py-2 font-semibold">{table.name}</td><td className="px-3 py-2">{column.name || column.column_name || column.attribute}</td><td className="px-3 py-2">{column.data_type || column.type}</td><td className="px-3 py-2">{column.primary_key ? <Check className="h-3.5 w-3.5 text-[#e67225]" /> : column.foreign_key ? 'FK' : ''}</td><td className="px-3 py-2">{column.classification || column.sensitivity || ''}</td></tr>))}</tbody></table></div>
    )}
  </div>;
};
