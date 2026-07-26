import React, { useState } from "react";
import {
  GitBranch,
  Plus,
  Download,
  Trash2,
  Key,
  KeyRound,
  Check,
  Edit2,
  Table as TableIcon,
  Network
} from "lucide-react";
import { LogicalEntity, LogicalRelationship, LogicalAttribute, ClassificationType } from "../../types";
import { exportStage3Excel } from "../../utils/excelExporter";
import { ERDiagramCanvas } from "./ERDiagramCanvas";

interface Stage3CanvasProps {
  entities: LogicalEntity[];
  relationships: LogicalRelationship[];
  onUpdateEntities: (entities: LogicalEntity[]) => void;
  onUpdateRelationships: (rels: LogicalRelationship[]) => void;
  onAdvanceStage: () => void;
  viewStyle?: "standard" | "er";
  onViewStyleChange?: (style: "standard" | "er") => void;
}

export const Stage3LogicalCanvas: React.FC<Stage3CanvasProps> = ({
  entities,
  relationships,
  onUpdateEntities,
  onUpdateRelationships,
  onAdvanceStage,
  viewStyle = "standard",
  onViewStyleChange
}) => {
  const [selectedEntityId, setSelectedEntityId] = useState<string>(entities[0]?.id || "");
  const [showAddAttrModal, setShowAddAttrModal] = useState(false);
  const [showAddEntityModal, setShowAddEntityModal] = useState(false);

  // New Entity form state
  const [newEntityName, setNewEntityName] = useState("");
  const [newEntityLogicalName, setNewEntityLogicalName] = useState("");
  const [newEntityDesc, setNewEntityDesc] = useState("");

  // New attribute form state
  const [newAttrName, setNewAttrName] = useState("");
  const [newAttrType, setNewAttrType] = useState("VARCHAR(100)");
  const [newAttrPk, setNewAttrPk] = useState(false);
  const [newAttrFk, setNewAttrFk] = useState(false);
  const [newAttrNull, setNewAttrNull] = useState(true);
  const [newAttrDesc, setNewAttrDesc] = useState("");

  const selectedEntity = entities.find((e) => e.id === selectedEntityId) || entities[0];

  const handleAddEntity = () => {
    if (!newEntityName) return;
    const newEnt: LogicalEntity = {
      id: `ent-${Date.now()}`,
      name: newEntityName,
      logicalName: newEntityLogicalName || newEntityName.replace(/_/g, " "),
      description: newEntityDesc || "Logical entity record",
      x: 200 + entities.length * 30,
      y: 150 + entities.length * 20,
      attributes: [
        {
          id: `la-${Date.now()}-1`,
          name: `${newEntityName.toLowerCase()}_id`,
          dataType: "BIGINT",
          isPrimaryKey: true,
          isForeignKey: false,
          isNullable: false,
          description: "Primary Key Identifier",
          classification: "Operational"
        }
      ]
    };
    onUpdateEntities([...entities, newEnt]);
    setSelectedEntityId(newEnt.id);
    setShowAddEntityModal(false);
    setNewEntityName("");
    setNewEntityLogicalName("");
    setNewEntityDesc("");
  };

  const handleAddAttribute = () => {
    if (!selectedEntity || !newAttrName) return;

    const newAttr: LogicalAttribute = {
      id: `la-${Date.now()}`,
      name: newAttrName,
      dataType: newAttrType,
      isPrimaryKey: newAttrPk,
      isForeignKey: newAttrFk,
      isNullable: newAttrNull,
      description: newAttrDesc || "Logical attribute",
      classification: "Operational"
    };

    const updated = entities.map((ent) => {
      if (ent.id !== selectedEntity.id) return ent;
      return {
        ...ent,
        attributes: [...ent.attributes, newAttr]
      };
    });

    onUpdateEntities(updated);
    setShowAddAttrModal(false);
    setNewAttrName("");
  };

  const handleDeleteAttribute = (attrId: string) => {
    if (!selectedEntity) return;
    const updated = entities.map((ent) => {
      if (ent.id !== selectedEntity.id) return ent;
      return {
        ...ent,
        attributes: ent.attributes.filter((a) => a.id !== attrId)
      };
    });
    onUpdateEntities(updated);
  };

  const handleSingleExport = () => {
    exportStage3Excel(entities);
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ entities, relationships }, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "Logical_Data_Model_Artifacts.json");
    downloadAnchor.click();
  };

  return (
    <div className="h-full flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
      {/* Header */}
      <div className="bg-slate-50/80 border-b border-slate-200 p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-bold text-slate-800 text-sm sm:text-base">Logical Data Model (3NF Cleansed)</h2>

          {/* Canvas Mode Toggle on Canvas Header */}
          {onViewStyleChange && (
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs ml-2">
              <button
                onClick={() => onViewStyleChange("standard")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  viewStyle === "standard"
                    ? "bg-white text-orange-600 shadow-2xs font-bold"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <TableIcon className="w-3.5 h-3.5" />
                <span>Table View</span>
              </button>

              <button
                onClick={() => onViewStyleChange("er")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  viewStyle === "er"
                    ? "bg-orange-600 text-white shadow-2xs font-bold"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <Network className="w-3.5 h-3.5" />
                <span>Diagram View</span>
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Single Unified Export Button */}
          <button
            onClick={handleSingleExport}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-all cursor-pointer shadow-2xs"
            title="Export Logical Data Model artifacts (Excel & JSON)"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" />
            <span>Export LDM Artifacts</span>
          </button>

          <button
            onClick={onAdvanceStage}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all cursor-pointer"
          >
            <span>Approve & Proceed to Stage 4</span>
          </button>
        </div>
      </div>

      {/* Main Canvas Body Router */}
      {viewStyle === "er" ? (
        <ERDiagramCanvas
          entities={entities}
          relationships={relationships}
          onUpdateEntities={onUpdateEntities}
          onUpdateRelationships={onUpdateRelationships}
          onAdvanceStage={onAdvanceStage}
        />
      ) : (
        <div className="flex-1 overflow-auto p-4 space-y-4 bg-slate-50/30">
        
        {/* Entity Selector Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-200 no-scrollbar">
          {entities.map((entity) => (
            <button
              key={entity.id}
              onClick={() => setSelectedEntityId(entity.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                selectedEntity?.id === entity.id
                  ? "bg-white text-indigo-700 border border-indigo-200 shadow-2xs font-bold"
                  : "bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200"
              }`}
            >
              {entity.name} ({entity.attributes.length} attrs)
            </button>
          ))}
        </div>

        {/* Selected Entity Details & Attributes Table */}
        {selectedEntity && (
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center justify-between shadow-2xs">
              <div>
                <h3 className="font-mono font-bold text-base text-slate-800">{selectedEntity.name}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{selectedEntity.description}</p>
              </div>
              <span className="text-[10px] font-mono px-2.5 py-1 rounded bg-slate-50 text-slate-600 border border-slate-200 font-semibold">
                Logical Title: {selectedEntity.logicalName}
              </span>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3">Keys</th>
                    <th className="p-3">Attribute Name</th>
                    <th className="p-3">Logical Data Type</th>
                    <th className="p-3">Nullable</th>
                    <th className="p-3">Classification</th>
                    <th className="p-3">Description</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedEntity.attributes.map((attr) => (
                    <tr key={attr.id} className="hover:bg-slate-50/80">
                      <td className="p-3">
                        {attr.isPrimaryKey && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 mr-1">
                            <Key className="w-3 h-3" /> PK
                          </span>
                        )}
                        {attr.isForeignKey && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                            <KeyRound className="w-3 h-3" /> FK
                          </span>
                        )}
                      </td>
                      <td className="p-3 font-mono font-bold text-slate-900">{attr.name}</td>
                      <td className="p-3 font-mono text-indigo-600 font-medium">{attr.dataType}</td>
                      <td className="p-3">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                          attr.isNullable ? "bg-slate-100 text-slate-500 border border-slate-200" : "bg-indigo-50 text-indigo-700 border border-indigo-200"
                        }`}>
                          {attr.isNullable ? "NULLABLE" : "NOT NULL"}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium border border-slate-200">
                          {attr.classification}
                        </span>
                      </td>
                      <td className="p-3 text-slate-500">{attr.description}</td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => handleDeleteAttribute(attr.id)}
                          className="p-1 text-slate-400 hover:text-rose-600"
                          title="Delete Attribute"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    )}

      {/* Add Attribute Modal */}
      {showAddAttrModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 max-w-md w-full space-y-4 shadow-xl">
            <h3 className="font-bold text-base text-slate-800">Add Attribute to {selectedEntity?.name}</h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Attribute Name *</label>
                <input
                  type="text"
                  placeholder="e.g. email_domain"
                  value={newAttrName}
                  onChange={(e) => setNewAttrName(e.target.value)}
                  className="w-full bg-slate-50 text-slate-800 p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Data Type</label>
                <input
                  type="text"
                  value={newAttrType}
                  onChange={(e) => setNewAttrType(e.target.value)}
                  className="w-full bg-slate-50 text-slate-800 p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                />
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 cursor-pointer text-slate-700 font-medium">
                  <input
                    type="checkbox"
                    checked={newAttrPk}
                    onChange={(e) => setNewAttrPk(e.target.checked)}
                  />
                  <span>Primary Key</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-slate-700 font-medium">
                  <input
                    type="checkbox"
                    checked={newAttrFk}
                    onChange={(e) => setNewAttrFk(e.target.checked)}
                  />
                  <span>Foreign Key</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-slate-700 font-medium">
                  <input
                    type="checkbox"
                    checked={newAttrNull}
                    onChange={(e) => setNewAttrNull(e.target.checked)}
                  />
                  <span>Nullable</span>
                </label>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Description</label>
                <input
                  type="text"
                  placeholder="Business definition..."
                  value={newAttrDesc}
                  onChange={(e) => setNewAttrDesc(e.target.value)}
                  className="w-full bg-slate-50 text-slate-800 p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAddAttrModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-100 text-slate-600 text-xs font-medium hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={handleAddAttribute}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm"
              >
                Add Attribute
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Entity Modal */}
      {showAddEntityModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 max-w-md w-full space-y-4 shadow-xl">
            <h3 className="font-bold text-base text-slate-800">Add New Logical Entity</h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Entity Physical/Technical Name *</label>
                <input
                  type="text"
                  placeholder="e.g. CUSTOMER_ORDER"
                  value={newEntityName}
                  onChange={(e) => setNewEntityName(e.target.value)}
                  className="w-full bg-slate-50 text-slate-800 p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Logical Business Title</label>
                <input
                  type="text"
                  placeholder="e.g. Customer Order Record"
                  value={newEntityLogicalName}
                  onChange={(e) => setNewEntityLogicalName(e.target.value)}
                  className="w-full bg-slate-50 text-slate-800 p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Business scope of this entity..."
                  value={newEntityDesc}
                  onChange={(e) => setNewEntityDesc(e.target.value)}
                  className="w-full bg-slate-50 text-slate-800 p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAddEntityModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-100 text-slate-600 text-xs font-medium hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={handleAddEntity}
                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-sm"
              >
                Save Entity
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
