import React, { useState } from "react";
import { X, Bot, Plus, Upload, FileText, Zap, Trash2, Check, Sparkles, FolderUp } from "lucide-react";
import { AgentMarketplaceItem, AgentDocument } from "../types";

interface AgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateAgent: (agent: AgentMarketplaceItem) => void;
}

export const AgentModal: React.FC<AgentModalProps> = ({ isOpen, onClose, onCreateAgent }) => {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<AgentMarketplaceItem["category"]>("Custom");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [outputArtifacts, setOutputArtifacts] = useState("Custom DDL & Validation Report");

  // Skills and Documents states
  const [skills, setSkills] = useState<string[]>([
    "3NF Data Normalization",
    "PII Sensitive Masking"
  ]);
  const [newSkillInput, setNewSkillInput] = useState("");

  const [documents, setDocuments] = useState<AgentDocument[]>([
    {
      id: "doc-sample-1",
      name: "Enterprise_Naming_Convention_2026.pdf",
      size: "1.4 MB",
      type: "application/pdf",
      uploadedAt: "Just now"
    }
  ]);

  if (!isOpen) return null;

  const handleAddSkill = () => {
    if (!newSkillInput.trim()) return;
    if (!skills.includes(newSkillInput.trim())) {
      setSkills([...skills, newSkillInput.trim()]);
    }
    setNewSkillInput("");
  };

  const handleRemoveSkill = (skillToRemove: string) => {
    setSkills(skills.filter((s) => s !== skillToRemove));
  };

  const handleAddSuggestedSkill = (suggested: string) => {
    if (!skills.includes(suggested)) {
      setSkills([...skills, suggested]);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleDocumentFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files) as File[];
    const newDocs: AgentDocument[] = fileList.map((file) => ({
      id: `doc-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      name: file.name,
      size: formatFileSize(file.size),
      type: file.type || "application/octet-stream",
      uploadedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    }));

    setDocuments((prev) => [...prev, ...newDocs]);
    e.target.value = "";
  };

  const handleSkillFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files) as File[];
    const newSkillNames: string[] = fileList.map((file) => {
      return file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
    });

    const uniqueNewSkills = newSkillNames.filter((s) => !skills.includes(s));
    setSkills((prev) => [...prev, ...uniqueNewSkills]);
    e.target.value = "";
  };

  const handleRemoveDocument = (docId: string) => {
    setDocuments(documents.filter((d) => d.id !== docId));
  };

  const handleAddSampleDocument = (sampleName: string, sampleSize: string) => {
    const newDoc: AgentDocument = {
      id: `doc-${Date.now()}`,
      name: sampleName,
      size: sampleSize,
      type: "application/pdf",
      uploadedAt: "Just now"
    };
    setDocuments((prev) => [...prev, newDoc]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !role) return;

    const newAgent: AgentMarketplaceItem = {
      id: `custom-agent-${Date.now()}`,
      name,
      role,
      description: description || "User custom-crafted data modeling assistant agent with loaded skills & documents.",
      category,
      iconName: "Bot",
      systemPrompt: systemPrompt || "Execute custom data architecture instructions.",
      inputTypes: ["CSV", "JSON", "Schema Definition"],
      outputArtifacts: outputArtifacts.split(",").map((s) => s.trim()),
      skills,
      documents,
      isPredefined: false,
      rating: 5.0,
      usageCount: 1
    };

    onCreateAgent(newAgent);
    onClose();
    setName("");
    setRole("");
    setDescription("");
    setSystemPrompt("");
    setSkills(["3NF Data Normalization", "PII Sensitive Masking"]);
    setDocuments([]);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 text-slate-800 rounded-xl max-w-xl w-full p-6 shadow-xl relative space-y-4 max-h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-3 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#e67225]/10 text-[#e67225] flex items-center justify-center">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900">Create Custom Agent</h3>
              <p className="text-[11px] text-slate-500">Add agent details, skills, and documents</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Single Pane Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs overflow-y-auto pr-1 flex-1">
          
          {/* Agent Basic Details */}
          <div className="space-y-3">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Agent Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Data Governance Compliance Auditor"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-50 text-slate-800 p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#e67225]"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Role / Specialty *</label>
              <input
                type="text"
                required
                placeholder="e.g. Scans for HIPAA compliance and auto-generates mask policies"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full bg-slate-50 text-slate-800 p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#e67225]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as any)}
                  className="w-full bg-slate-50 text-slate-800 p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#e67225]"
                >
                  <option value="Profiling">Profiling</option>
                  <option value="Conceptual">Conceptual</option>
                  <option value="Logical">Logical</option>
                  <option value="Physical">Physical</option>
                  <option value="Compliance & DQ">Compliance & DQ</option>
                  <option value="Custom">Custom</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Output Artifacts</label>
                <input
                  type="text"
                  value={outputArtifacts}
                  onChange={(e) => setOutputArtifacts(e.target.value)}
                  placeholder="Comma-separated artifacts"
                  className="w-full bg-slate-50 text-slate-800 p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#e67225]"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Description</label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of capabilities..."
                className="w-full bg-slate-50 text-slate-800 p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#e67225]"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">System Instructions / Prompt</label>
              <textarea
                rows={2}
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="You are an expert data modeling assistant that..."
                className="w-full bg-slate-50 text-slate-800 p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#e67225]"
              />
            </div>
          </div>

          {/* Skills Section */}
          <div className="space-y-3 border-t border-slate-100 pt-3">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-[#e67225]" />
                <span>Agent Skills</span>
              </label>

              <label className="text-[11px] font-bold text-[#e67225] hover:underline cursor-pointer flex items-center gap-1">
                <FolderUp className="w-3.5 h-3.5" />
                <span>Upload Skill File</span>
                <input
                  type="file"
                  accept=".md,.json,.txt"
                  multiple
                  onChange={handleSkillFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={newSkillInput}
                onChange={(e) => setNewSkillInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddSkill();
                  }
                }}
                placeholder="Add custom skill or capability..."
                className="flex-1 bg-slate-50 text-slate-800 p-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#e67225]"
              />
              <button
                type="button"
                onClick={handleAddSkill}
                className="px-3 py-2 bg-[#e67225] hover:bg-[#d0621a] text-white font-bold rounded-lg transition-colors flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </div>

            {/* Suggested Skills */}
            <div className="flex flex-wrap gap-1">
              {[
                "Data Vault 2.0",
                "3NF Normalization",
                "Snowflake DDL",
                "PII Masking",
                "Star Schema"
              ].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleAddSuggestedSkill(s)}
                  disabled={skills.includes(s)}
                  className={`text-[10px] px-2 py-0.5 rounded border transition-all cursor-pointer ${
                    skills.includes(s)
                      ? "bg-slate-100 text-slate-400 border-slate-200 cursor-default"
                      : "bg-white text-slate-600 border-slate-200 hover:border-[#e67225] hover:text-[#e67225]"
                  }`}
                >
                  + {s}
                </button>
              ))}
            </div>

            {/* Attached Skills */}
            {skills.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {skills.map((skill) => (
                  <span
                    key={skill}
                    className="inline-flex items-center gap-1 bg-[#e67225]/10 text-slate-900 border border-[#e67225]/30 px-2.5 py-0.5 rounded-md text-[11px] font-bold"
                  >
                    <span>{skill}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveSkill(skill)}
                      className="hover:text-rose-600 ml-1 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Documents Section */}
          <div className="space-y-3 border-t border-slate-100 pt-3">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-blue-600" />
                <span>Knowledge Documents</span>
              </label>

              <label className="text-[11px] font-bold text-blue-600 hover:underline cursor-pointer flex items-center gap-1">
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Document</span>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.csv,.xlsx,.sql,.md,.json,.txt"
                  onChange={handleDocumentFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            {/* Quick Sample Attachments */}
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => handleAddSampleDocument("Enterprise_Data_Governance.pdf", "2.1 MB")}
                className="px-2 py-1 bg-white border border-slate-200 hover:border-blue-500 text-slate-700 hover:text-blue-600 rounded-lg text-[10px] font-medium flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
              >
                <Plus className="w-3 h-3 text-blue-600" />
                <span>Attach Spec.pdf</span>
              </button>
              <button
                type="button"
                onClick={() => handleAddSampleDocument("HIPAA_Sensitivity_Rules.docx", "840 KB")}
                className="px-2 py-1 bg-white border border-slate-200 hover:border-blue-500 text-slate-700 hover:text-blue-600 rounded-lg text-[10px] font-medium flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
              >
                <Plus className="w-3 h-3 text-blue-600" />
                <span>Attach HIPAA Rules.docx</span>
              </button>
            </div>

            {/* Uploaded Documents List */}
            {documents.length > 0 && (
              <div className="space-y-1 pt-1">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span className="font-semibold text-slate-800 truncate text-[11px]">{doc.name}</span>
                      <span className="text-[10px] text-slate-400 shrink-0">({doc.size})</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveDocument(doc.id)}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-200 shrink-0">
            <span className="text-[11px] text-slate-500">
              {skills.length} skills • {documents.length} docs
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-[#e67225] hover:bg-[#d0621a] text-white font-bold flex items-center gap-1 shadow-xs cursor-pointer transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Create Agent</span>
              </button>
            </div>
          </div>
        </form>

      </div>
    </div>
  );
};

