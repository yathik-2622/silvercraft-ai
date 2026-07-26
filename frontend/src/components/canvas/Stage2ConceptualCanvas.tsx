import React, { useState } from "react";
import {
  BrainCircuit,
  Plus,
  Download,
  Trash2,
  Edit3,
  Check,
  ArrowRight,
  Table as TableIcon,
  Network
} from "lucide-react";
import { ConceptualConcept, ConceptualRelationship, CardinalityType } from "../../types";
import { exportStage2Excel } from "../../utils/excelExporter";
import { ConceptualDiagramCanvas } from "./ConceptualDiagramCanvas";

interface Stage2CanvasProps {
  concepts: ConceptualConcept[];
  relationships: ConceptualRelationship[];
  onUpdateConcepts: (concepts: ConceptualConcept[]) => void;
  onUpdateRelationships: (rels: ConceptualRelationship[]) => void;
  onAdvanceStage: () => void;
  viewStyle?: "standard" | "er";
  onViewStyleChange?: (style: "standard" | "er") => void;
}

export const Stage2ConceptualCanvas: React.FC<Stage2CanvasProps> = ({
  concepts,
  relationships,
  onUpdateConcepts,
  onUpdateRelationships,
  onAdvanceStage,
  viewStyle = "standard",
  onViewStyleChange
}) => {
  const [newConceptName, setNewConceptName] = useState("");
  const [newConceptDomain, setNewConceptDomain] = useState("");
  const [newConceptDesc, setNewConceptDesc] = useState("");
  const [showAddConceptModal, setShowAddConceptModal] = useState(false);

  const handleAddConcept = () => {
    if (!newConceptName) return;
    const newC: ConceptualConcept = {
      id: `c-${Date.now()}`,
      name: newConceptName,
      domain: newConceptDomain || "General Business Domain",
      description: newConceptDesc || "Enterprise business concept",
      keyAttributes: ["id", "name", "created_at"],
      x: 200 + concepts.length * 40,
      y: 150
    };
    onUpdateConcepts([...concepts, newC]);
    setNewConceptName("");
    setNewConceptDomain("");
    setNewConceptDesc("");
    setShowAddConceptModal(false);
  };

  const [editingConceptId, setEditingConceptId] = useState<string | null>(null);
  const [editingRelId, setEditingRelId] = useState<string | null>(null);
  const [showAddRelModal, setShowAddRelModal] = useState(false);

  // New relationship form
  const [newRelSource, setNewRelSource] = useState("");
  const [newRelName, setNewRelName] = useState("");
  const [newRelTarget, setNewRelTarget] = useState("");
  const [newRelCard, setNewRelCard] = useState<CardinalityType>("1:N");
  const [newRelDesc, setNewRelDesc] = useState("");

  const handleAddRelationship = () => {
    if (!newRelSource || !newRelTarget || !newRelName) return;
    const newR: ConceptualRelationship = {
      id: `r-${Date.now()}`,
      sourceConceptId: newRelSource,
      targetConceptId: newRelTarget,
      relationshipName: newRelName,
      cardinality: newRelCard,
      description: newRelDesc || "Business concept association"
    };
    onUpdateRelationships([...relationships, newR]);
    setShowAddRelModal(false);
    setNewRelName("");
    setNewRelDesc("");
  };

  const handleDeleteConcept = (id: string) => {
    onUpdateConcepts(concepts.filter((c) => c.id !== id));
    onUpdateRelationships(relationships.filter((r) => r.sourceConceptId !== id && r.targetConceptId !== id));
  };

  const handleDeleteRelationship = (id: string) => {
    onUpdateRelationships(relationships.filter((r) => r.id !== id));
  };

  const handleUpdateConceptInline = (id: string, field: keyof ConceptualConcept, val: any) => {
    onUpdateConcepts(
      concepts.map((c) => (c.id === id ? { ...c, [field]: val } : c))
    );
  };

  const handleUpdateRelInline = (id: string, field: keyof ConceptualRelationship, val: any) => {
    onUpdateRelationships(
      relationships.map((r) => (r.id === id ? { ...r, [field]: val } : r))
    );
  };

  const handleSingleExport = () => {
    // Single bone button for all exports (Excel & JSON)
    exportStage2Excel(concepts, relationships);
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ concepts, relationships }, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "Conceptual_Data_Model_Artifacts.json");
    downloadAnchor.click();
  };

  return (
    <div className="h-full flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
      {/* Header */}
      <div className="bg-slate-50/80 border-b border-slate-200 p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-bold text-slate-800 text-sm sm:text-base">Conceptual Data Model</h2>

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

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* Single Unified Export Button */}
          <button
            onClick={handleSingleExport}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-all cursor-pointer shadow-2xs"
            title="Export complete Stage 2 Conceptual Model artifacts (Excel & JSON)"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" />
            <span>Export Model Artifacts</span>
          </button>

          <button
            onClick={onAdvanceStage}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all cursor-pointer"
          >
            <span>Approve & Proceed to Stage 3</span>
          </button>
        </div>
      </div>

      {/* Main Canvas Body Router */}
      {viewStyle === "er" ? (
        <ConceptualDiagramCanvas
          concepts={concepts}
          relationships={relationships}
          onUpdateConcepts={onUpdateConcepts}
          onUpdateRelationships={onUpdateRelationships}
          onAdvanceStage={onAdvanceStage}
        />
      ) : (
        <div className="flex-1 overflow-auto p-6 space-y-6 bg-slate-50/30">
        
        {/* Business Concepts Grid */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Enterprise Business Concepts ({concepts.length})</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {concepts.map((concept) => (
              <div
                key={concept.id}
                className="bg-white border border-purple-200 rounded-xl p-4 shadow-2xs hover:border-purple-300 transition-all space-y-3 relative group"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div>
                    <h4 className="font-bold text-sm text-slate-800">{concept.name}</h4>
                    <span className="text-[10px] text-purple-700 font-semibold px-2 py-0.5 rounded-full bg-purple-50 border border-purple-100">
                      {concept.domain}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDeleteConcept(concept.id)}
                    className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                    title="Delete Concept"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">{concept.description}</p>

                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-[11px]">
                  <span className="text-slate-500 font-semibold block mb-1">Key Business Attributes:</span>
                  <div className="flex flex-wrap gap-1">
                    {concept.keyAttributes.map((attr) => (
                      <span key={attr} className="bg-white text-slate-700 px-2 py-0.5 rounded border border-slate-200 font-mono text-[10px] font-medium">
                        {attr}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Business Relationships Table */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Concept Relationships & Cardinality</h3>
            <button
              onClick={() => {
                if (concepts.length >= 2) {
                  setNewRelSource(concepts[0].id);
                  setNewRelTarget(concepts[1].id);
                }
                setShowAddRelModal(true);
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>Add Relationship</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">Source Concept</th>
                  <th className="p-3">Relationship Verbalization</th>
                  <th className="p-3">Target Concept</th>
                  <th className="p-3">Cardinality</th>
                  <th className="p-3">Description</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {relationships.map((rel) => {
                  const src = concepts.find((c) => c.id === rel.sourceConceptId)?.name || rel.sourceConceptId;
                  const tgt = concepts.find((c) => c.id === rel.targetConceptId)?.name || rel.targetConceptId;

                  return (
                    <tr key={rel.id} className="hover:bg-slate-50/80">
                      <td className="p-3 font-bold text-slate-800">{src}</td>
                      <td className="p-3 italic text-purple-700 font-medium">"{rel.relationshipName}"</td>
                      <td className="p-3 font-bold text-slate-800">{tgt}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-mono font-bold text-[10px] border border-indigo-200">
                          {rel.cardinality}
                        </span>
                      </td>
                      <td className="p-3 text-slate-500">{rel.description}</td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => handleDeleteRelationship(rel.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                          title="Delete Relationship"
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
    )}

      {/* Modal for Adding Concept */}
      {showAddConceptModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 max-w-md w-full space-y-4 shadow-xl">
            <h3 className="font-bold text-base text-slate-800">Add New Business Concept</h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Concept Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Shipment"
                  value={newConceptName}
                  onChange={(e) => setNewConceptName(e.target.value)}
                  className="w-full bg-slate-50 text-slate-800 p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Domain</label>
                <input
                  type="text"
                  placeholder="e.g. Logistics & Fulfillment"
                  value={newConceptDomain}
                  onChange={(e) => setNewConceptDomain(e.target.value)}
                  className="w-full bg-slate-50 text-slate-800 p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Business definition of this concept..."
                  value={newConceptDesc}
                  onChange={(e) => setNewConceptDesc(e.target.value)}
                  className="w-full bg-slate-50 text-slate-800 p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAddConceptModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-100 text-slate-600 text-xs font-medium hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={handleAddConcept}
                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-sm"
              >
                Save Concept
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal for Adding Relationship */}
      {showAddRelModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 max-w-md w-full space-y-4 shadow-xl">
            <h3 className="font-bold text-base text-slate-800">Add Concept Relationship</h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Source Concept</label>
                <select
                  value={newRelSource}
                  onChange={(e) => setNewRelSource(e.target.value)}
                  className="w-full bg-slate-50 text-slate-800 p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
                >
                  {concepts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.domain})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Relationship Verbalization *</label>
                <input
                  type="text"
                  placeholder='e.g. "places", "contains", "belongs to"'
                  value={newRelName}
                  onChange={(e) => setNewRelName(e.target.value)}
                  className="w-full bg-slate-50 text-slate-800 p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Target Concept</label>
                <select
                  value={newRelTarget}
                  onChange={(e) => setNewRelTarget(e.target.value)}
                  className="w-full bg-slate-50 text-slate-800 p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
                >
                  {concepts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.domain})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Cardinality</label>
                <select
                  value={newRelCard}
                  onChange={(e) => setNewRelCard(e.target.value as CardinalityType)}
                  className="w-full bg-slate-50 text-slate-800 p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500 font-mono"
                >
                  <option value="1:1">1:1 (One-to-One)</option>
                  <option value="1:N">1:N (One-to-Many)</option>
                  <option value="M:N">M:N (Many-to-Many)</option>
                  <option value="0:1">0:1 (Zero-or-One)</option>
                  <option value="0:N">0:N (Zero-or-Many)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Description</label>
                <input
                  type="text"
                  placeholder="Business definition of relationship..."
                  value={newRelDesc}
                  onChange={(e) => setNewRelDesc(e.target.value)}
                  className="w-full bg-slate-50 text-slate-800 p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
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
                onClick={handleAddRelationship}
                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-sm"
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
