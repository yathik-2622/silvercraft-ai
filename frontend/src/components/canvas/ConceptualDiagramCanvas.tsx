import React, { useState } from "react";
import {
  BrainCircuit,
  Plus,
  Trash2,
  Edit3,
  Search,
  ArrowRight,
  Sparkles,
  Layers,
  X,
  Check
} from "lucide-react";
import { ConceptualConcept, ConceptualRelationship, CardinalityType } from "../../types";

interface ConceptualDiagramCanvasProps {
  concepts: ConceptualConcept[];
  relationships: ConceptualRelationship[];
  onUpdateConcepts: (concepts: ConceptualConcept[]) => void;
  onUpdateRelationships: (rels: ConceptualRelationship[]) => void;
  onAdvanceStage?: () => void;
}

export const ConceptualDiagramCanvas: React.FC<ConceptualDiagramCanvasProps> = ({
  concepts,
  relationships,
  onUpdateConcepts,
  onUpdateRelationships,
  onAdvanceStage
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(null);

  // Concept Modal State
  const [showConceptModal, setShowConceptModal] = useState(false);
  const [editingConcept, setEditingConcept] = useState<ConceptualConcept | null>(null);
  const [conceptName, setConceptName] = useState("");
  const [conceptDomain, setConceptDomain] = useState("");
  const [conceptDesc, setConceptDesc] = useState("");
  const [conceptKeys, setConceptKeys] = useState("id, name");

  // Relationship Modal State
  const [showRelModal, setShowRelModal] = useState(false);
  const [relSourceId, setRelSourceId] = useState("");
  const [relTargetId, setRelTargetId] = useState("");
  const [relName, setRelName] = useState("");
  const [relCard, setRelCard] = useState<CardinalityType>("1:N");
  const [relDesc, setRelDesc] = useState("");

  const filteredConcepts = concepts.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.domain.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.keyAttributes.some((k) => k.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // CONCEPT CRUD
  const handleSaveConcept = () => {
    if (!conceptName.trim()) return;

    const keysArray = conceptKeys
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);

    if (editingConcept) {
      const updated = concepts.map((c) =>
        c.id === editingConcept.id
          ? {
              ...c,
              name: conceptName,
              domain: conceptDomain || "General Domain",
              description: conceptDesc || "Business concept entity",
              keyAttributes: keysArray.length > 0 ? keysArray : c.keyAttributes
            }
          : c
      );
      onUpdateConcepts(updated);
      setEditingConcept(null);
    } else {
      const newC: ConceptualConcept = {
        id: `c-${Date.now()}`,
        name: conceptName,
        domain: conceptDomain || "General Domain",
        description: conceptDesc || "High-level enterprise business concept",
        keyAttributes: keysArray.length > 0 ? keysArray : ["id", "name"],
        x: 150 + concepts.length * 30,
        y: 120
      };
      onUpdateConcepts([...concepts, newC]);
    }

    setConceptName("");
    setConceptDomain("");
    setConceptDesc("");
    setConceptKeys("id, name");
    setShowConceptModal(false);
  };

  const handleDeleteConcept = (id: string) => {
    onUpdateConcepts(concepts.filter((c) => c.id !== id));
    onUpdateRelationships(relationships.filter((r) => r.sourceConceptId !== id && r.targetConceptId !== id));
  };

  const handleOpenEditConcept = (c: ConceptualConcept) => {
    setEditingConcept(c);
    setConceptName(c.name);
    setConceptDomain(c.domain);
    setConceptDesc(c.description || "");
    setConceptKeys(c.keyAttributes.join(", "));
    setShowConceptModal(true);
  };

  // RELATIONSHIP CRUD
  const handleSaveRelationship = () => {
    if (!relSourceId || !relTargetId || !relName) return;

    const newR: ConceptualRelationship = {
      id: `cr-${Date.now()}`,
      sourceConceptId: relSourceId,
      targetConceptId: relTargetId,
      relationshipName: relName,
      cardinality: relCard,
      description: relDesc || "Concept relationship"
    };

    onUpdateRelationships([...relationships, newR]);
    setRelName("");
    setRelDesc("");
    setShowRelModal(false);
  };

  const handleDeleteRelationship = (id: string) => {
    onUpdateRelationships(relationships.filter((r) => r.id !== id));
  };

  return (
    <div className="h-full flex flex-col bg-slate-100/80 rounded-xl border border-slate-200 overflow-hidden relative">
      {/* Conceptual Diagram Toolbar */}
      <div className="bg-white p-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-purple-50 text-purple-600 rounded-lg">
            <BrainCircuit className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-xs text-slate-800">Conceptual Business Model Diagram</h3>
            <p className="text-[11px] text-slate-500">
              High-level domain concepts, business keys & cardinalities
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
            <input
              type="text"
              placeholder="Search concepts or domains..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-purple-500 w-48 sm:w-60"
            />
          </div>

          {onAdvanceStage && (
            <button
              onClick={onAdvanceStage}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-2xs"
            >
              Approve & Proceed
            </button>
          )}
        </div>
      </div>

      {/* Canvas Area */}
      <div className="flex-1 overflow-auto p-6 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:16px_16px]">
        {/* Concepts Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
          {filteredConcepts.map((concept) => {
            const relsForConcept = relationships.filter(
              (r) => r.sourceConceptId === concept.id || r.targetConceptId === concept.id
            );

            return (
              <div
                key={concept.id}
                onClick={() => setSelectedConceptId(concept.id)}
                className={`bg-white rounded-xl border transition-all shadow-sm overflow-hidden flex flex-col ${
                  selectedConceptId === concept.id
                    ? "border-purple-500 ring-2 ring-purple-500/20 shadow-md"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                {/* Concept Header */}
                <div className="bg-orange-50 text-slate-900 p-3 flex items-center justify-between border-b border-orange-200">
                  <div className="flex items-center gap-2 min-w-0">
                    <BrainCircuit className="w-4 h-4 text-orange-600 shrink-0" />
                    <span className="font-bold text-xs truncate">{concept.name}</span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenEditConcept(concept);
                      }}
                      className="p-1 text-slate-400 hover:text-white rounded transition-colors cursor-pointer"
                      title="Edit Concept"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteConcept(concept.id);
                      }}
                      className="p-1 text-slate-400 hover:text-rose-400 rounded transition-colors cursor-pointer"
                      title="Delete Concept"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Domain & Description */}
                <div className="p-3 bg-purple-50/50 border-b border-slate-200 space-y-1">
                  <div className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 border border-purple-200">
                    {concept.domain}
                  </div>
                  <p className="text-xs text-slate-600 line-clamp-2">{concept.description}</p>
                </div>

                {/* Key Attributes */}
                <div className="p-3 space-y-2 flex-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    Key Business Attributes
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {concept.keyAttributes.map((ka, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-1 rounded bg-slate-100 text-slate-800 border border-slate-200 font-mono text-[11px] font-semibold"
                      >
                        {ka}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Connected Business Relationships */}
                <div className="p-3 bg-slate-50 border-t border-slate-200 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                      Relationships ({relsForConcept.length})
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setRelSourceId(concept.id);
                        const otherC = concepts.find((c) => c.id !== concept.id) || concept;
                        setRelTargetId(otherC.id);
                        setRelName("associated_with");
                        setRelCard("1:N");
                        setShowRelModal(true);
                      }}
                      className="text-[10px] font-bold text-purple-700 hover:text-purple-900 bg-purple-100 hover:bg-purple-200 px-2 py-0.5 rounded border border-purple-200 transition-all cursor-pointer flex items-center gap-1"
                    >
                      <Plus className="w-2.5 h-2.5" />
                      <span>Add Rel</span>
                    </button>
                  </div>

                  {relsForConcept.length > 0 && (
                    <div className="space-y-1">
                      {relsForConcept.map((rel) => {
                        const isSource = rel.sourceConceptId === concept.id;
                        const otherConcept = concepts.find(
                          (c) => c.id === (isSource ? rel.targetConceptId : rel.sourceConceptId)
                        );

                        return (
                          <div
                            key={rel.id}
                            className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200 text-[11px] shadow-2xs hover:border-purple-300 transition-all"
                          >
                            <div className="flex items-center gap-1.5 text-slate-700 min-w-0 flex-1">
                              {/* Editable Connecting Verb */}
                              <input
                                type="text"
                                value={rel.relationshipName}
                                onChange={(e) => {
                                  const newName = e.target.value;
                                  onUpdateRelationships(
                                    relationships.map((r) =>
                                      r.id === rel.id ? { ...r, relationshipName: newName } : r
                                    )
                                  );
                                }}
                                className="font-semibold text-purple-700 bg-purple-50/50 hover:bg-purple-100 px-1 py-0.5 rounded border border-purple-200 text-xs min-w-[60px] max-w-[100px] focus:outline-none focus:ring-1 focus:ring-purple-500"
                                title="Click to edit connecting verb"
                              />
                              <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                              <span className="font-medium text-slate-800 truncate">
                                {otherConcept?.name || "Target Concept"}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0 ml-1">
                              {/* Editable Cardinality Dropdown directly on Canvas */}
                              <select
                                value={rel.cardinality}
                                onChange={(e) => {
                                  const newCard = e.target.value as CardinalityType;
                                  onUpdateRelationships(
                                    relationships.map((r) =>
                                      r.id === rel.id ? { ...r, cardinality: newCard } : r
                                    )
                                  );
                                }}
                                className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-300 cursor-pointer focus:outline-none focus:ring-1 focus:ring-amber-500"
                                title="Change relationship cardinality"
                              >
                                <option value="1:1">1:1</option>
                                <option value="1:N">1:N</option>
                                <option value="N:M">N:M</option>
                                <option value="0:1">0:1</option>
                                <option value="0:N">0:N</option>
                              </select>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteRelationship(rel.id);
                                }}
                                className="text-slate-400 hover:text-rose-600 p-0.5 rounded hover:bg-rose-50 transition-colors cursor-pointer"
                                title="Delete Relationship"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Canvas Native + Add Concept Card */}
          <div
            onClick={() => {
              setEditingConcept(null);
              setConceptName("");
              setConceptDomain("");
              setConceptDesc("");
              setConceptKeys("id, name");
              setShowConceptModal(true);
            }}
            className="bg-white/80 hover:bg-purple-50/50 border-2 border-dashed border-purple-300 hover:border-purple-500 rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all group min-h-[260px] shadow-2xs"
          >
            <div className="w-12 h-12 rounded-full bg-purple-100 group-hover:bg-purple-600 text-purple-600 group-hover:text-white flex items-center justify-center transition-all mb-3 shadow-2xs">
              <Plus className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-sm text-slate-800 group-hover:text-purple-900 mb-1">
              + Add New Business Concept
            </h4>
            <p className="text-xs text-slate-500 group-hover:text-purple-700 max-w-xs">
              Create domain concept entity, business keys, and connect relationships directly on canvas
            </p>
          </div>
        </div>

        {/* Conceptual Relationships ER Connectors Panel */}
        <div className="mt-8 bg-white border border-slate-200 rounded-xl p-4 shadow-2xs max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-purple-600"></span>
              <h4 className="font-bold text-xs text-slate-800">Conceptual ER Relationships & Connector Links</h4>
            </div>
            <span className="text-[11px] text-slate-500 font-mono">
              {relationships.length} active concept-to-concept relationship links
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="p-2.5">Source Concept</th>
                  <th className="p-2.5">Connecting Verb / Action</th>
                  <th className="p-2.5">Cardinality Connector</th>
                  <th className="p-2.5">Target Concept</th>
                  <th className="p-2.5">Description</th>
                  <th className="p-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {relationships.map((rel) => {
                  const sourceC = concepts.find((c) => c.id === rel.sourceConceptId);
                  const targetC = concepts.find((c) => c.id === rel.targetConceptId);

                  return (
                    <tr key={rel.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-2.5 font-bold text-slate-800">{sourceC?.name || rel.sourceConceptId}</td>
                      <td className="p-2.5">
                        <input
                          type="text"
                          value={rel.relationshipName}
                          onChange={(e) => {
                            const newName = e.target.value;
                            onUpdateRelationships(
                              relationships.map((r) => (r.id === rel.id ? { ...r, relationshipName: newName } : r))
                            );
                          }}
                          className="font-semibold text-purple-700 bg-purple-50 px-2 py-1 rounded border border-purple-200 text-xs w-36 focus:outline-none focus:ring-1 focus:ring-purple-500"
                        />
                      </td>
                      <td className="p-2.5">
                        <select
                          value={rel.cardinality}
                          onChange={(e) => {
                            const newCard = e.target.value as CardinalityType;
                            onUpdateRelationships(
                              relationships.map((r) => (r.id === rel.id ? { ...r, cardinality: newCard } : r))
                            );
                          }}
                          className="px-2 py-1 rounded text-xs font-bold bg-amber-50 text-amber-800 border border-amber-300 cursor-pointer"
                        >
                          <option value="1:1">1:1</option>
                          <option value="1:N">1:N</option>
                          <option value="N:M">N:M</option>
                          <option value="0:1">0:1</option>
                          <option value="0:N">0:N</option>
                        </select>
                      </td>
                      <td className="p-2.5 font-bold text-slate-800">{targetC?.name || rel.targetConceptId}</td>
                      <td className="p-2.5 text-slate-600 font-sans">{rel.description || "Business relationship link"}</td>
                      <td className="p-2.5 text-right">
                        <button
                          onClick={() => handleDeleteRelationship(rel.id)}
                          className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 transition-colors cursor-pointer"
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

      {/* Add / Edit Concept Modal */}
      {showConceptModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="bg-orange-600 text-white p-4 flex items-center justify-between">
              <h3 className="font-bold text-sm">
                {editingConcept ? "Edit Business Concept" : "Add New Business Concept"}
              </h3>
              <button onClick={() => setShowConceptModal(false)} className="text-orange-200 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 font-medium mb-1">Concept Name</label>
                <input
                  type="text"
                  value={conceptName}
                  onChange={(e) => setConceptName(e.target.value)}
                  placeholder="e.g. Customer, Order, Product"
                  className="w-full p-2 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500 font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">Business Domain</label>
                <input
                  type="text"
                  value={conceptDomain}
                  onChange={(e) => setConceptDomain(e.target.value)}
                  placeholder="e.g. Sales, Finance, Supply Chain"
                  className="w-full p-2 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">Key Business Attributes (Comma separated)</label>
                <input
                  type="text"
                  value={conceptKeys}
                  onChange={(e) => setConceptKeys(e.target.value)}
                  placeholder="e.g. customer_id, email, full_name"
                  className="w-full p-2 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">Business Definition / Description</label>
                <textarea
                  value={conceptDesc}
                  onChange={(e) => setConceptDesc(e.target.value)}
                  placeholder="High-level enterprise definition..."
                  rows={2}
                  className="w-full p-2 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
            </div>

            <div className="bg-slate-50 p-3 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setShowConceptModal(false)}
                className="px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveConcept}
                className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold"
              >
                Save Concept
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Relationship Modal */}
      {showRelModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="bg-orange-600 text-white p-4 flex items-center justify-between">
              <h3 className="font-bold text-sm">Add Concept Relationship</h3>
              <button onClick={() => setShowRelModal(false)} className="text-orange-200 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 font-medium mb-1">Source Concept</label>
                <select
                  value={relSourceId}
                  onChange={(e) => setRelSourceId(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500 font-medium"
                >
                  {concepts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.domain})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">Relationship Name</label>
                <input
                  type="text"
                  value={relName}
                  onChange={(e) => setRelName(e.target.value)}
                  placeholder="e.g. places, contains, belongs_to"
                  className="w-full p-2 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500 font-semibold"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">Target Concept</label>
                <select
                  value={relTargetId}
                  onChange={(e) => setRelTargetId(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500 font-medium"
                >
                  {concepts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.domain})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">Cardinality</label>
                <select
                  value={relCard}
                  onChange={(e) => setRelCard(e.target.value as CardinalityType)}
                  className="w-full p-2 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500 font-bold"
                >
                  <option value="1:1">1:1 (One-to-One)</option>
                  <option value="1:N">1:N (One-to-Many)</option>
                  <option value="N:M">N:M (Many-to-Many)</option>
                </select>
              </div>
            </div>

            <div className="bg-slate-50 p-3 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setShowRelModal(false)}
                className="px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRelationship}
                className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold"
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
