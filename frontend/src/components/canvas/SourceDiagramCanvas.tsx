import React, { useState, useMemo } from "react";
import {
  Database,
  Plus,
  Trash2,
  Search,
  Key,
  X,
  Link2,
  Network
} from "lucide-react";
import { SourceTableProfile, CardinalityType, SourceRelationship } from "../../types";

interface SourceDiagramCanvasProps {
  sourceTables: SourceTableProfile[];
  onUpdateSourceTables?: (tables: SourceTableProfile[]) => void;
  relationships?: SourceRelationship[];
  onUpdateRelationships?: (rels: SourceRelationship[]) => void;
  onAdvanceStage?: () => void;
}

export const SourceDiagramCanvas: React.FC<SourceDiagramCanvasProps> = ({
  sourceTables,
  relationships: externalRels,
  onUpdateRelationships,
  onAdvanceStage
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);

  // Initial inferred relationships state if not externally managed
  const [internalRels, setInternalRels] = useState<SourceRelationship[]>(() => {
    const rels: SourceRelationship[] = [];
    let counter = 1;

    // Direct explicit key linkages or inferred relationships
    sourceTables.forEach((st) => {
      st.columns.forEach((col) => {
        if (col.isForeignKey || col.columnName.endsWith("_id")) {
          const targetBase = col.columnName.replace("_id", "");
          const targetTbl = sourceTables.find(
            (t) =>
              t.tableName !== st.tableName &&
              (t.tableName.includes(targetBase) || targetBase.includes(t.tableName))
          );
          if (targetTbl) {
            const pkCol = targetTbl.columns.find((c) => c.isPrimaryKey) || targetTbl.columns[0];
            // Avoid duplicate links
            const exists = rels.some(
              (r) =>
                r.sourceTable === st.tableName &&
                r.sourceColumn === col.columnName &&
                r.targetTable === targetTbl.tableName
            );
            if (!exists) {
              rels.push({
                id: `src-rel-${counter++}`,
                sourceTable: st.tableName,
                sourceColumn: col.columnName,
                targetTable: targetTbl.tableName,
                targetColumn: pkCol?.columnName || "id",
                cardinality: "1:N",
                description: `Inferred relationship (${col.columnName} -> ${targetTbl.tableName}.${pkCol?.columnName || "id"})`
              });
            }
          }
        }
      });
    });
    return rels;
  });

  const relationships = externalRels || internalRels;

  const updateRels = (newRels: SourceRelationship[]) => {
    if (onUpdateRelationships) {
      onUpdateRelationships(newRels);
    } else {
      setInternalRels(newRels);
    }
  };

  // Relationship Modal State
  const [showAddRelModal, setShowAddRelModal] = useState(false);
  const [relSourceTable, setRelSourceTable] = useState(sourceTables[0]?.tableName || "");
  const [relSourceCol, setRelSourceCol] = useState(sourceTables[0]?.columns[0]?.columnName || "");
  const [relTargetTable, setRelTargetTable] = useState(sourceTables[1]?.tableName || sourceTables[0]?.tableName || "");
  const [relTargetCol, setRelTargetCol] = useState(sourceTables[1]?.columns[0]?.columnName || "id");
  const [relCardinality, setRelCardinality] = useState<CardinalityType>("1:N");
  const [relDesc, setRelDesc] = useState("");

  // Calculate connected tables for the selected table
  const selectedTable = sourceTables.find((t) => t.id === selectedTableId);
  const connectedTableNames = useMemo(() => {
    if (!selectedTable) return new Set<string>();
    const names = new Set<string>();
    names.add(selectedTable.tableName);

    relationships.forEach((rel) => {
      if (rel.sourceTable === selectedTable.tableName) {
        names.add(rel.targetTable);
      }
      if (rel.targetTable === selectedTable.tableName) {
        names.add(rel.sourceTable);
      }
    });
    return names;
  }, [selectedTable, relationships]);

  // Filtered tables
  const filteredTables = sourceTables.filter(
    (t) =>
      t.tableName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.columns.some((c) => c.columnName.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // RELATIONSHIP HANDLERS
  const handleAddRelationship = () => {
    if (!relSourceTable || !relTargetTable) return;
    const newRel: SourceRelationship = {
      id: `src-rel-${Date.now()}`,
      sourceTable: relSourceTable,
      sourceColumn: relSourceCol,
      targetTable: relTargetTable,
      targetColumn: relTargetCol,
      cardinality: relCardinality,
      description: relDesc || `Defined ${relCardinality} relationship`
    };
    updateRels([...relationships, newRel]);
    setShowAddRelModal(false);
    setRelDesc("");
  };

  const handleDeleteRelationship = (relId: string) => {
    updateRels(relationships.filter((r) => r.id !== relId));
  };

  const handleUpdateCardinality = (relId: string, newCard: CardinalityType) => {
    updateRels(relationships.map((r) => (r.id === relId ? { ...r, cardinality: newCard } : r)));
  };

  return (
    <div className="h-full flex flex-col bg-slate-100/70 overflow-hidden">
      {/* Studio Controls Header Bar */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-50 text-orange-600 rounded-lg border border-orange-200">
            <Network className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Source Relational ERD Diagram</h3>
            <p className="text-xs text-slate-500">
              Inspect table entity relationships. Manage, edit, or create custom relationship linkages below.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* Search Input */}
          <div className="relative flex-1 sm:w-56">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search table or column..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg border border-indigo-200 text-xs font-bold shrink-0">
            <Network className="w-3.5 h-3.5 text-indigo-600" />
            <span>{relationships.length} ERD Connectors</span>
          </div>
        </div>
      </div>

      {/* Selected Table Highlighting Banner Indicator */}
      {selectedTable && (
        <div className="bg-orange-50 border-b border-orange-200 px-4 py-2 flex items-center justify-between text-xs text-orange-900 shrink-0">
          <div className="flex items-center gap-2 font-mono">
            <span className="font-bold">Highlighting Connections for:</span>
            <span className="px-2 py-0.5 bg-orange-600 text-white font-bold rounded text-[11px]">
              {selectedTable.tableName}
            </span>
            <span className="text-orange-700 font-sans text-[11px]">
              ({connectedTableNames.size - 1} connected tables found)
            </span>
          </div>
          <button
            onClick={() => setSelectedTableId(null)}
            className="text-orange-700 hover:text-orange-900 font-bold underline text-[11px] cursor-pointer"
          >
            Clear Highlight
          </button>
        </div>
      )}

      {/* Main ERD Canvas Area */}
      <div className="flex-1 overflow-auto p-6 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:18px_18px]">
        {/* Table Nodes Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
          {filteredTables.map((table) => {
            const isSelected = selectedTableId === table.id;
            const isConnected = selectedTableId ? connectedTableNames.has(table.tableName) : true;

            return (
              <div
                key={table.id}
                onClick={() => setSelectedTableId(table.id)}
                className={`bg-white rounded-xl border transition-all shadow-sm overflow-hidden flex flex-col cursor-pointer ${
                  isSelected
                    ? "border-orange-500 ring-2 ring-orange-500/40 shadow-md scale-[1.01]"
                    : isConnected
                    ? "border-slate-300 hover:border-slate-400"
                    : "border-slate-200 opacity-40 hover:opacity-80"
                }`}
              >
                {/* Table Node Header */}
                <div
                  className={`p-3 flex items-center justify-between border-b transition-colors ${
                    isSelected
                      ? "bg-orange-600 text-white border-orange-700"
                      : isConnected && selectedTableId
                      ? "bg-orange-100 text-orange-950 border-orange-200"
                      : "bg-orange-50 text-slate-900 border-orange-200"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Database className={`w-4 h-4 shrink-0 ${isSelected ? "text-white" : "text-orange-600"}`} />
                    <span className="font-mono font-bold text-xs truncate">{table.tableName}</span>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-mono shrink-0 ${
                    isSelected ? "bg-white/20 text-white" : "bg-orange-100 text-orange-900 font-bold border border-orange-200"
                  }`}>
                    {table.rowCount.toLocaleString()} rows
                  </span>
                </div>

                {/* Description Bar */}
                <div className="bg-slate-50 px-3 py-1.5 border-b border-slate-200 flex items-center justify-between text-[11px] text-slate-600">
                  <span className="truncate max-w-[220px]">{table.description || "Source dataset"}</span>
                  <span className="text-[10px] font-mono text-slate-500 font-semibold">{table.columns.length} cols</span>
                </div>

                {/* Column List */}
                <div className="p-2 space-y-1 divide-y divide-slate-100 flex-1 max-h-72 overflow-y-auto">
                  {table.columns.map((col) => {
                    return (
                      <div
                        key={col.id}
                        className="pt-1.5 first:pt-0 flex items-center justify-between gap-2 text-xs p-1 rounded hover:bg-slate-50"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          {col.isPrimaryKey ? (
                            <Key className="w-3 h-3 text-amber-500 shrink-0" />
                          ) : col.isForeignKey ? (
                            <span className="text-[9px] font-bold text-orange-600 bg-orange-50 border border-orange-200 px-1 rounded shrink-0">
                              FK
                            </span>
                          ) : (
                            <span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" />
                          )}
                          <span className="font-mono font-semibold text-slate-800 truncate">{col.columnName}</span>
                        </div>
                        <span className="font-mono text-[10px] text-slate-400 shrink-0">{col.dataType}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Table Line Connector Badges */}
                {(() => {
                  const tableRels = relationships.filter(
                    (r) => r.sourceTable === table.tableName || r.targetTable === table.tableName
                  );
                  if (tableRels.length === 0) return null;
                  return (
                    <div className="bg-indigo-50/70 border-t border-indigo-100 p-2 space-y-1 text-[10px]">
                      <span className="font-bold text-indigo-900 text-[9px] uppercase tracking-wider block">
                        Line Connectors ({tableRels.length})
                      </span>
                      {tableRels.map((rel) => {
                        const isOutgoing = rel.sourceTable === table.tableName;
                        const otherTable = isOutgoing ? rel.targetTable : rel.sourceTable;
                        return (
                          <div
                            key={rel.id}
                            className="flex items-center justify-between bg-white px-2 py-0.5 rounded border border-indigo-200 font-mono text-slate-700"
                          >
                            <span className="truncate max-w-[140px]">
                              {isOutgoing ? "──────►" : "◄──────"} {otherTable}
                            </span>
                            <span className="bg-indigo-600 text-white font-bold px-1 rounded text-[9px]">
                              {rel.cardinality}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>

        {/* Source Relationships Manager Table */}
        <div className="mt-8 bg-white border border-slate-200 rounded-xl p-4 shadow-2xs max-w-7xl mx-auto space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-600"></span>
              <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider">
                Source Entity Relationships & Cardinalities ({relationships.length})
              </h4>
            </div>
            <button
              onClick={() => {
                if (sourceTables.length > 0) {
                  setRelSourceTable(sourceTables[0].tableName);
                  setRelSourceCol(sourceTables[0].columns[0]?.columnName || "");
                  setRelTargetTable(sourceTables[1]?.tableName || sourceTables[0].tableName);
                  setRelTargetCol(sourceTables[1]?.columns[0]?.columnName || "id");
                }
                setShowAddRelModal(true);
              }}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Relationship</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="p-2.5">Source Table (FK)</th>
                  <th className="p-2.5">FK Column</th>
                  <th className="p-2.5">Cardinality</th>
                  <th className="p-2.5">Target Table (PK)</th>
                  <th className="p-2.5">PK Column</th>
                  <th className="p-2.5">Description</th>
                  <th className="p-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {relationships.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-4 text-center text-slate-400 font-sans">
                      No relationships defined yet. Click "+ Add Relationship" above to connect source tables.
                    </td>
                  </tr>
                ) : (
                  relationships.map((rel) => {
                    const isRelatedToSelected =
                      selectedTableId &&
                      (rel.sourceTable === selectedTable?.tableName || rel.targetTable === selectedTable?.tableName);

                    return (
                      <tr
                        key={rel.id}
                        className={`transition-colors ${
                          isRelatedToSelected ? "bg-orange-50/80 font-bold" : "hover:bg-slate-50/80"
                        }`}
                      >
                        <td className="p-2.5 font-bold text-slate-900">{rel.sourceTable}</td>
                        <td className="p-2.5 text-orange-600 font-semibold">{rel.sourceColumn}</td>
                        <td className="p-2.5">
                          <select
                            value={rel.cardinality}
                            onChange={(e) => handleUpdateCardinality(rel.id, e.target.value as CardinalityType)}
                            className="bg-purple-50 text-purple-700 border border-purple-200 rounded px-2 py-0.5 text-[10px] font-bold focus:outline-none cursor-pointer"
                          >
                            <option value="1:1">1:1</option>
                            <option value="1:N">1:N</option>
                            <option value="N:M">N:M</option>
                          </select>
                        </td>
                        <td className="p-2.5 font-bold text-slate-900">{rel.targetTable}</td>
                        <td className="p-2.5 text-emerald-600 font-semibold">{rel.targetColumn}</td>
                        <td className="p-2.5 font-sans text-slate-500 text-[11px] truncate max-w-xs">{rel.description}</td>
                        <td className="p-2.5 text-right font-sans">
                          <button
                            onClick={() => handleDeleteRelationship(rel.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                            title="Delete Relationship"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add Custom Relationship Modal */}
      {showAddRelModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden">
            <div className="bg-orange-600 text-white p-4 flex items-center justify-between">
              <h3 className="font-bold text-sm">Add Source Relational Link</h3>
              <button onClick={() => setShowAddRelModal(false)} className="text-orange-200 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Source Table (FK side)</label>
                  <select
                    value={relSourceTable}
                    onChange={(e) => {
                      setRelSourceTable(e.target.value);
                      const tbl = sourceTables.find((t) => t.tableName === e.target.value);
                      if (tbl) setRelSourceCol(tbl.columns[0]?.columnName || "");
                    }}
                    className="w-full p-2 border border-slate-200 rounded-lg text-slate-800 font-bold font-mono"
                  >
                    {sourceTables.map((t) => (
                      <option key={t.id} value={t.tableName}>
                        {t.tableName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-600 font-medium mb-1">Source Foreign Key Column</label>
                  <select
                    value={relSourceCol}
                    onChange={(e) => setRelSourceCol(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg text-slate-800 font-bold font-mono"
                  >
                    {sourceTables
                      .find((t) => t.tableName === relSourceTable)
                      ?.columns.map((c) => (
                        <option key={c.id} value={c.columnName}>
                          {c.columnName} ({c.dataType})
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Target Table (PK side)</label>
                  <select
                    value={relTargetTable}
                    onChange={(e) => {
                      setRelTargetTable(e.target.value);
                      const tbl = sourceTables.find((t) => t.tableName === e.target.value);
                      if (tbl) setRelTargetCol(tbl.columns[0]?.columnName || "id");
                    }}
                    className="w-full p-2 border border-slate-200 rounded-lg text-slate-800 font-bold font-mono"
                  >
                    {sourceTables.map((t) => (
                      <option key={t.id} value={t.tableName}>
                        {t.tableName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-600 font-medium mb-1">Target Primary Key Column</label>
                  <select
                    value={relTargetCol}
                    onChange={(e) => setRelTargetCol(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg text-slate-800 font-bold font-mono"
                  >
                    {sourceTables
                      .find((t) => t.tableName === relTargetTable)
                      ?.columns.map((c) => (
                        <option key={c.id} value={c.columnName}>
                          {c.columnName} ({c.dataType})
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Cardinality Ratio</label>
                  <select
                    value={relCardinality}
                    onChange={(e) => setRelCardinality(e.target.value as CardinalityType)}
                    className="w-full p-2 border border-slate-200 rounded-lg text-slate-800 font-bold"
                  >
                    <option value="1:1">1:1 (One to One)</option>
                    <option value="1:N">1:N (One to Many)</option>
                    <option value="N:M">N:M (Many to Many)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-600 font-medium mb-1">Description / Notes</label>
                  <input
                    type="text"
                    value={relDesc}
                    onChange={(e) => setRelDesc(e.target.value)}
                    placeholder="e.g. FK constraint linkage"
                    className="w-full p-2 border border-slate-200 rounded-lg text-slate-800 font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="bg-slate-50 p-3 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setShowAddRelModal(false)}
                className="px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleAddRelationship}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold cursor-pointer"
              >
                Save Relationship
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
