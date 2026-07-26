import React, { useState } from "react";
import {
  Key,
  Link,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  ArrowRight,
  Database,
  Search,
  Grid,
  ShieldAlert,
  Network
} from "lucide-react";
import {
  LogicalEntity,
  LogicalRelationship,
  LogicalAttribute,
  CardinalityType,
  ClassificationType
} from "../../types";

interface ERDiagramCanvasProps {
  entities: LogicalEntity[];
  relationships: LogicalRelationship[];
  onUpdateEntities: (entities: LogicalEntity[]) => void;
  onUpdateRelationships: (rels: LogicalRelationship[]) => void;
  onAdvanceStage?: () => void;
}

export const ERDiagramCanvas: React.FC<ERDiagramCanvasProps> = ({
  entities,
  relationships,
  onUpdateEntities,
  onUpdateRelationships,
  onAdvanceStage,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  
  // Entity CRUD Modal States
  const [showAddEntityModal, setShowAddEntityModal] = useState(false);
  const [editingEntity, setEditingEntity] = useState<LogicalEntity | null>(null);
  const [entityName, setEntityName] = useState("");
  const [entityLogicalName, setEntityLogicalName] = useState("");
  const [entityDesc, setEntityDesc] = useState("");

  // Attribute CRUD Modal States
  const [selectedEntityForAttr, setSelectedEntityForAttr] = useState<LogicalEntity | null>(null);
  const [editingAttr, setEditingAttr] = useState<{ entityId: string; attr: LogicalAttribute } | null>(null);
  const [attrName, setAttrName] = useState("");
  const [attrType, setAttrType] = useState("VARCHAR(255)");
  const [attrIsPk, setAttrIsPk] = useState(false);
  const [attrIsFk, setAttrIsFk] = useState(false);
  const [attrNullable, setAttrNullable] = useState(true);
  const [attrDesc, setAttrDesc] = useState("");
  const [attrClassification, setAttrClassification] = useState<ClassificationType>("Operational");

  // Relationship CRUD Modal States
  const [showAddRelModal, setShowAddRelModal] = useState(false);
  const [relSourceId, setRelSourceId] = useState("");
  const [relSourceAttr, setRelSourceAttr] = useState("");
  const [relTargetId, setRelTargetId] = useState("");
  const [relTargetAttr, setRelTargetAttr] = useState("");
  const [relCardinality, setRelCardinality] = useState<CardinalityType>("1:N");

  // Search Filter
  const filteredEntities = entities.filter(e =>
    e.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.logicalName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.attributes.some(a => a.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // ENTITY CRUD HANDLERS
  const handleSaveEntity = () => {
    if (!entityName.trim()) return;

    if (editingEntity) {
      // Update
      const updated = entities.map(e =>
        e.id === editingEntity.id
          ? { ...e, name: entityName, logicalName: entityLogicalName || entityName, description: entityDesc }
          : e
      );
      onUpdateEntities(updated);
      setEditingEntity(null);
    } else {
      // Create
      const newEntity: LogicalEntity = {
        id: `e-${Date.now()}`,
        name: entityName,
        logicalName: entityLogicalName || entityName,
        description: entityDesc || "Normalized silver entity",
        attributes: [
          {
            id: `a-${Date.now()}-1`,
            name: `${entityName.toLowerCase().replace(/[^a-z0-9_]/g, "")}_id`,
            dataType: "BIGINT",
            isPrimaryKey: true,
            isForeignKey: false,
            isNullable: false,
            description: "Surrogate primary key",
            classification: "Operational"
          }
        ],
        x: 100 + entities.length * 30,
        y: 100
      };
      onUpdateEntities([...entities, newEntity]);
    }

    setEntityName("");
    setEntityLogicalName("");
    setEntityDesc("");
    setShowAddEntityModal(false);
  };

  const handleDeleteEntity = (id: string) => {
    onUpdateEntities(entities.filter(e => e.id !== id));
    onUpdateRelationships(relationships.filter(r => r.sourceEntityId !== id && r.targetEntityId !== id));
  };

  const handleOpenEditEntity = (e: LogicalEntity) => {
    setEditingEntity(e);
    setEntityName(e.name);
    setEntityLogicalName(e.logicalName || e.name);
    setEntityDesc(e.description || "");
    setShowAddEntityModal(true);
  };

  // ATTRIBUTE CRUD HANDLERS
  const handleSaveAttribute = () => {
    if (!attrName.trim()) return;

    if (editingAttr) {
      // Edit column
      const updatedEntities = entities.map(e => {
        if (e.id === editingAttr.entityId) {
          const updatedAttrs = e.attributes.map(a =>
            a.id === editingAttr.attr.id
              ? {
                  ...a,
                  name: attrName,
                  dataType: attrType,
                  isPrimaryKey: attrIsPk,
                  isForeignKey: attrIsFk,
                  isNullable: attrNullable,
                  description: attrDesc,
                  classification: attrClassification
                }
              : a
          );
          return { ...e, attributes: updatedAttrs };
        }
        return e;
      });
      onUpdateEntities(updatedEntities);
      setEditingAttr(null);
    } else if (selectedEntityForAttr) {
      // Add column
      const newAttr: LogicalAttribute = {
        id: `a-${Date.now()}`,
        name: attrName,
        dataType: attrType,
        isPrimaryKey: attrIsPk,
        isForeignKey: attrIsFk,
        isNullable: attrNullable,
        description: attrDesc,
        classification: attrClassification
      };

      const updatedEntities = entities.map(e =>
        e.id === selectedEntityForAttr.id
          ? { ...e, attributes: [...e.attributes, newAttr] }
          : e
      );
      onUpdateEntities(updatedEntities);
      setSelectedEntityForAttr(null);
    }

    setAttrName("");
    setAttrType("VARCHAR(255)");
    setAttrIsPk(false);
    setAttrIsFk(false);
    setAttrNullable(true);
    setAttrDesc("");
    setAttrClassification("Operational");
  };

  const handleDeleteAttribute = (entityId: string, attrId: string) => {
    const updated = entities.map(e => {
      if (e.id === entityId) {
        return { ...e, attributes: e.attributes.filter(a => a.id !== attrId) };
      }
      return e;
    });
    onUpdateEntities(updated);
  };

  const handleOpenEditAttr = (entityId: string, attr: LogicalAttribute) => {
    setEditingAttr({ entityId, attr });
    setAttrName(attr.name);
    setAttrType(attr.dataType);
    setAttrIsPk(attr.isPrimaryKey);
    setAttrIsFk(attr.isForeignKey);
    setAttrNullable(attr.isNullable);
    setAttrDesc(attr.description || "");
    setAttrClassification(attr.classification || "Operational");
  };

  // RELATIONSHIP CRUD HANDLERS
  const handleSaveRelationship = () => {
    if (!relSourceId || !relTargetId) return;

    const newRel: LogicalRelationship = {
      id: `r-${Date.now()}`,
      sourceEntityId: relSourceId,
      sourceAttributeName: relSourceAttr || "id",
      targetEntityId: relTargetId,
      targetAttributeName: relTargetAttr || "fk_id",
      cardinality: relCardinality
    };

    onUpdateRelationships([...relationships, newRel]);
    setShowAddRelModal(false);
    setRelSourceId("");
    setRelTargetId("");
  };

  const handleDeleteRel = (id: string) => {
    onUpdateRelationships(relationships.filter(r => r.id !== id));
  };

  return (
    <div className="h-full flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      {/* ER Diagram Top Action Header */}
      <div className="bg-slate-50/80 border-b border-slate-200 p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
            ER Diagram Mode
          </span>
          <h2 className="font-bold text-slate-800 text-sm sm:text-base">Entity-Relationship Visual Studio</h2>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
            <input
              type="text"
              placeholder="Search entities/fields..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-white text-slate-800 text-xs pl-8 pr-3 py-1 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-44"
            />
          </div>

          {onAdvanceStage && (
            <button
              onClick={onAdvanceStage}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-all cursor-pointer"
            >
              <span>Approve ER Model</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Diagram Area */}
      <div className="flex-1 overflow-auto p-6 bg-slate-50/50 space-y-6">
        
        {/* Modeling Tool ER Relationship Connectors Diagram View */}
        <div className="bg-white border border-orange-200 rounded-xl p-4 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-orange-100 pb-2.5">
            <div className="flex items-center gap-2">
              <Network className="w-4 h-4 text-orange-600" />
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-orange-950">
                Visual ER Diagram Relationship Connectors ({relationships.length} Links)
              </h3>
            </div>
            <span className="text-[11px] text-orange-700 bg-orange-50 px-2.5 py-0.5 rounded-full font-mono font-bold border border-orange-200">
              Crow's Foot Notation / Key Constraints
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {relationships.map((rel) => {
              const srcEntity = entities.find(e => e.id === rel.sourceEntityId);
              const tgtEntity = entities.find(e => e.id === rel.targetEntityId);

              return (
                <div
                  key={rel.id}
                  className="bg-orange-50/50 border border-orange-200 rounded-lg p-3 flex items-center justify-between gap-3 text-xs shadow-2xs hover:border-orange-400 transition-all"
                >
                  {/* Source Entity Box */}
                  <div className="bg-white p-2 px-3 rounded-lg border border-orange-200 shadow-2xs min-w-[110px]">
                    <div className="font-bold text-slate-900 font-mono text-[11px]">
                      {srcEntity ? srcEntity.name : rel.sourceEntityId}
                    </div>
                    <div className="text-[10px] text-amber-700 font-mono flex items-center gap-1 font-semibold">
                      <Key className="w-2.5 h-2.5" />
                      <span>{rel.sourceAttributeName}</span>
                    </div>
                  </div>

                  {/* Visual Modeling Line Connector with Crow's Foot & Cardinality */}
                  <div className="flex-1 flex flex-col items-center justify-center relative">
                    <span className="bg-white text-orange-700 font-mono font-extrabold text-[10px] px-2 py-0.5 rounded-full border border-orange-300 shadow-2xs z-10 mb-0.5">
                      {rel.cardinality || "1:N"}
                    </span>
                    <div className="w-full flex items-center justify-center relative">
                      <div className="h-[2px] w-full bg-orange-400"></div>
                      <div className="absolute right-0 text-orange-600 font-extrabold text-sm leading-none -mt-[1px]">▸</div>
                    </div>
                    <span className="text-[9px] text-slate-500 font-sans mt-0.5 font-medium">
                      {rel.relationshipName || "FK Reference"}
                    </span>
                  </div>

                  {/* Target Entity Box */}
                  <div className="bg-white p-2 px-3 rounded-lg border border-orange-200 shadow-2xs min-w-[110px] text-right">
                    <div className="font-bold text-slate-900 font-mono text-[11px]">
                      {tgtEntity ? tgtEntity.name : rel.targetEntityId}
                    </div>
                    <div className="text-[10px] text-indigo-700 font-mono flex items-center justify-end gap-1 font-semibold">
                      <Link className="w-2.5 h-2.5" />
                      <span>{rel.targetAttributeName}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Visual Entity Node Cards Grid */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Interactive ER Entity Cards ({filteredEntities.length})
            </h3>
            <span className="text-[11px] text-slate-500">
              Direct CRUD: Edit attributes, set Primary/Foreign keys, manage constraints
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredEntities.map((entity) => (
              <div
                key={entity.id}
                className="bg-white border-2 border-orange-200 rounded-xl shadow-2xs hover:border-orange-400 transition-all flex flex-col overflow-hidden group"
              >
                {/* Node Header */}
                <div className="bg-orange-50/90 border-b border-orange-200 p-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <Database className="w-4 h-4 text-orange-600 shrink-0" />
                    <div className="truncate">
                      <h4 className="font-bold text-xs text-slate-900 truncate">{entity.name}</h4>
                      <p className="text-[10px] text-slate-500 font-medium truncate">{entity.logicalName}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleOpenEditEntity(entity)}
                      className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded transition-colors"
                      title="Edit Entity Name"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteEntity(entity.id)}
                      className="p-1 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded transition-colors"
                      title="Delete Entity"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Attributes Table Inside Card */}
                <div className="p-3 flex-1 space-y-2">
                  <p className="text-[11px] text-slate-500 italic leading-snug line-clamp-2">
                    {entity.description || "Normalized silver table entity"}
                  </p>

                  <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
                    <div className="bg-slate-50 px-2.5 py-1 flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase border-b border-slate-200">
                      <span>Column</span>
                      <span>Type</span>
                    </div>

                    <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
                      {entity.attributes.map((attr) => (
                        <div
                          key={attr.id}
                          className="px-2.5 py-1.5 flex items-center justify-between gap-2 hover:bg-slate-50 group/attr"
                        >
                          <div className="flex items-center gap-1.5 overflow-hidden">
                            {attr.isPrimaryKey && (
                              <span className="bg-amber-100 text-amber-800 text-[9px] font-extrabold px-1 py-0.2 rounded flex items-center gap-0.5 border border-amber-200 shrink-0">
                                <Key className="w-2.5 h-2.5" /> PK
                              </span>
                            )}
                            {attr.isForeignKey && (
                              <span className="bg-cyan-100 text-cyan-800 text-[9px] font-extrabold px-1 py-0.2 rounded flex items-center gap-0.5 border border-cyan-200 shrink-0">
                                <Link className="w-2.5 h-2.5" /> FK
                              </span>
                            )}
                            {attr.classification === "PII" && (
                              <span className="bg-rose-100 text-rose-700 text-[9px] font-bold px-1 py-0.2 rounded border border-rose-200 shrink-0">
                                PII
                              </span>
                            )}
                            <span className="font-mono text-xs text-slate-800 font-medium truncate">
                              {attr.name}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                              {attr.dataType}
                            </span>

                            <div className="hidden group-hover/attr:flex items-center gap-1">
                              <button
                                onClick={() => handleOpenEditAttr(entity.id, attr)}
                                className="p-0.5 text-slate-400 hover:text-indigo-600 rounded"
                                title="Edit Field"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => handleDeleteAttribute(entity.id, attr.id)}
                                className="p-0.5 text-slate-400 hover:text-red-600 rounded"
                                title="Delete Field"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Card Footer: Add Field */}
                <div className="p-2 bg-slate-50 border-t border-slate-200 flex justify-end">
                  <button
                    onClick={() => {
                      setSelectedEntityForAttr(entity);
                      setEditingAttr(null);
                      setAttrName("");
                      setAttrType("VARCHAR(255)");
                      setAttrIsPk(false);
                      setAttrIsFk(false);
                      setAttrNullable(true);
                      setAttrDesc("");
                      setAttrClassification("Operational");
                    }}
                    className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded hover:bg-indigo-50 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Column</span>
                  </button>
                </div>
              </div>
            ))}

            {/* Canvas Native + Add Entity Node Card */}
            <div
              onClick={() => {
                setEditingEntity(null);
                setEntityName("");
                setEntityLogicalName("");
                setEntityDesc("");
                setShowAddEntityModal(true);
              }}
              className="bg-white/80 hover:bg-indigo-50/50 border-2 border-dashed border-indigo-300 hover:border-indigo-500 rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all group min-h-[260px] shadow-2xs"
            >
              <div className="w-12 h-12 rounded-full bg-indigo-100 group-hover:bg-indigo-600 text-indigo-600 group-hover:text-white flex items-center justify-center transition-all mb-3 shadow-2xs">
                <Plus className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-sm text-slate-800 group-hover:text-indigo-900 mb-1">
                + Add Entity / Table
              </h4>
              <p className="text-xs text-slate-500 group-hover:text-indigo-700 max-w-xs">
                Add entity table, define columns, PK/FK constraints, and link relationships directly on canvas
              </p>
            </div>
          </div>
        </div>

        {/* Entity Relationships Connections Section */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Entity Relationships & Key Constraints ({relationships.length})
            </h3>

            <button
              onClick={() => setShowAddRelModal(true)}
              className="text-xs text-indigo-700 hover:text-indigo-900 font-bold flex items-center gap-1 cursor-pointer bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg border border-indigo-200 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Link / Relationship</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="p-2.5">Source Entity & Key</th>
                  <th className="p-2.5">Link / Cardinality (Click to Edit)</th>
                  <th className="p-2.5">Target Entity & Foreign Key</th>
                  <th className="p-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {relationships.map((rel) => {
                  const srcEntity = entities.find(e => e.id === rel.sourceEntityId)?.name || rel.sourceEntityId;
                  const tgtEntity = entities.find(e => e.id === rel.targetEntityId)?.name || rel.targetEntityId;

                  return (
                    <tr key={rel.id} className="hover:bg-slate-50">
                      <td className="p-2.5">
                        <span className="font-bold text-slate-800">{srcEntity}</span>
                        <span className="font-mono text-[10px] text-slate-500 ml-1.5">({rel.sourceAttributeName})</span>
                      </td>
                      <td className="p-2.5">
                        {/* Editable Cardinality Dropdown */}
                        <select
                          value={rel.cardinality || "1:N"}
                          onChange={(e) => {
                            const newCard = e.target.value as CardinalityType;
                            onUpdateRelationships(
                              relationships.map(r => r.id === rel.id ? { ...r, cardinality: newCard } : r)
                            );
                          }}
                          className="px-2 py-0.5 rounded bg-purple-50 text-purple-800 border border-purple-300 font-mono font-bold text-[10px] cursor-pointer focus:outline-none focus:ring-1 focus:ring-purple-500"
                        >
                          <option value="1:1">1:1 (One-to-One)</option>
                          <option value="1:N">1:N (One-to-Many)</option>
                          <option value="N:M">N:M (Many-to-Many)</option>
                          <option value="0:1">0:1 (Zero-or-One)</option>
                          <option value="0:N">0:N (Zero-or-Many)</option>
                        </select>
                      </td>
                      <td className="p-2.5">
                        <span className="font-bold text-slate-800">{tgtEntity}</span>
                        <span className="font-mono text-[10px] text-slate-500 ml-1.5">({rel.targetAttributeName})</span>
                      </td>
                      <td className="p-2.5 text-right">
                        <button
                          onClick={() => handleDeleteRel(rel.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                          title="Delete Link"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* MODAL: ADD / EDIT ENTITY */}
      {showAddEntityModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 max-w-md w-full space-y-4 shadow-xl">
            <h3 className="font-bold text-base text-slate-900">
              {editingEntity ? "Edit ER Entity" : "Create New ER Entity"}
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Entity / Table Name *</label>
                <input
                  type="text"
                  placeholder="e.g. dim_customer_silver"
                  value={entityName}
                  onChange={(e) => setEntityName(e.target.value)}
                  className="w-full bg-slate-50 text-slate-800 p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Business Logical Name</label>
                <input
                  type="text"
                  placeholder="e.g. Cleansed Customer Entity"
                  value={entityLogicalName}
                  onChange={(e) => setEntityLogicalName(e.target.value)}
                  className="w-full bg-slate-50 text-slate-800 p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Business definition or purpose..."
                  value={entityDesc}
                  onChange={(e) => setEntityDesc(e.target.value)}
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
                onClick={handleSaveEntity}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-2xs cursor-pointer"
              >
                {editingEntity ? "Update Entity" : "Create Entity"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT ATTRIBUTE */}
      {(selectedEntityForAttr || editingAttr) && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 max-w-md w-full space-y-4 shadow-xl">
            <h3 className="font-bold text-base text-slate-900">
              {editingAttr ? "Edit Column / Attribute" : `Add Column to ${selectedEntityForAttr?.name}`}
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Column Name *</label>
                <input
                  type="text"
                  placeholder="e.g. customer_email"
                  value={attrName}
                  onChange={(e) => setAttrName(e.target.value)}
                  className="w-full bg-slate-50 text-slate-800 p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Datatype</label>
                <input
                  type="text"
                  placeholder="e.g. VARCHAR(255), TIMESTAMP_NTZ, BIGINT, DECIMAL(18,2)"
                  value={attrType}
                  onChange={(e) => setAttrType(e.target.value)}
                  className="w-full bg-slate-50 text-slate-800 p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                />
              </div>

              <div className="flex items-center gap-4 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <label className="flex items-center gap-1.5 cursor-pointer font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={attrIsPk}
                    onChange={(e) => setAttrIsPk(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Primary Key</span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={attrIsFk}
                    onChange={(e) => setAttrIsFk(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Foreign Key</span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer text-slate-600">
                  <input
                    type="checkbox"
                    checked={attrNullable}
                    onChange={(e) => setAttrNullable(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Nullable</span>
                </label>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Data Classification</label>
                <select
                  value={attrClassification}
                  onChange={(e) => setAttrClassification(e.target.value as ClassificationType)}
                  className="w-full bg-slate-50 text-slate-800 p-2.5 rounded-lg border border-slate-200 focus:outline-none"
                >
                  <option value="Operational">Operational</option>
                  <option value="PII">PII (Personal Data)</option>
                  <option value="Financial">Financial</option>
                  <option value="Sensitive">Sensitive</option>
                  <option value="Public">Public</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Description / Cleansing Rule</label>
                <input
                  type="text"
                  placeholder="e.g. Cleansed email address with lowercase transform"
                  value={attrDesc}
                  onChange={(e) => setAttrDesc(e.target.value)}
                  className="w-full bg-slate-50 text-slate-800 p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setSelectedEntityForAttr(null);
                  setEditingAttr(null);
                }}
                className="px-4 py-2 rounded-lg bg-slate-100 text-slate-600 text-xs font-medium hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAttribute}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-2xs cursor-pointer"
              >
                Save Column
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD RELATIONSHIP */}
      {showAddRelModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 max-w-md w-full space-y-4 shadow-xl">
            <h3 className="font-bold text-base text-slate-900">Add ER Entity Relationship</h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Source Entity (Primary Table)</label>
                <select
                  value={relSourceId}
                  onChange={(e) => setRelSourceId(e.target.value)}
                  className="w-full bg-slate-50 text-slate-800 p-2.5 rounded-lg border border-slate-200 focus:outline-none"
                >
                  <option value="">-- Select Source Entity --</option>
                  {entities.map(e => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Source Key Column</label>
                <input
                  type="text"
                  placeholder="e.g. customer_id"
                  value={relSourceAttr}
                  onChange={(e) => setRelSourceAttr(e.target.value)}
                  className="w-full bg-slate-50 text-slate-800 p-2.5 rounded-lg border border-slate-200 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Target Entity (Foreign Table)</label>
                <select
                  value={relTargetId}
                  onChange={(e) => setRelTargetId(e.target.value)}
                  className="w-full bg-slate-50 text-slate-800 p-2.5 rounded-lg border border-slate-200 focus:outline-none"
                >
                  <option value="">-- Select Target Entity --</option>
                  {entities.map(e => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Target Foreign Key Column</label>
                <input
                  type="text"
                  placeholder="e.g. fk_customer_id"
                  value={relTargetAttr}
                  onChange={(e) => setRelTargetAttr(e.target.value)}
                  className="w-full bg-slate-50 text-slate-800 p-2.5 rounded-lg border border-slate-200 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Cardinality</label>
                <select
                  value={relCardinality}
                  onChange={(e) => setRelCardinality(e.target.value as CardinalityType)}
                  className="w-full bg-slate-50 text-slate-800 p-2.5 rounded-lg border border-slate-200"
                >
                  <option value="1:1">1:1 (One to One)</option>
                  <option value="1:N">1:N (One to Many)</option>
                  <option value="N:M">N:M (Many to Many)</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAddRelModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-100 text-slate-600 text-xs font-medium hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRelationship}
                disabled={!relSourceId || !relTargetId}
                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-2xs disabled:opacity-50 cursor-pointer"
              >
                Create Link
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
