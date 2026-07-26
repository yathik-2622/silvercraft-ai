import React, { useState } from "react";
import {
  FileSpreadsheet,
  Download,
  Plus,
  ChevronRight,
  Database,
  Search,
  Shield,
  Layers,
  ChevronDown,
  Table as TableIcon,
  Link2,
  X,
  Upload,
  Cloud,
  CheckCircle2
} from "lucide-react";
import {
  SourceTableProfile,
  SensitivityType,
  ClassificationType,
  SourceRelationship
} from "../../types";
import {
  exportDataProfilerExcel,
  exportDataDictionaryExcel,
  exportClassificationExcel,
  exportSourceRelationshipsExcel,
  exportStage1Excel
} from "../../utils/excelExporter";
import { SourceDiagramCanvas } from "./SourceDiagramCanvas";

interface Stage1SourceAnalysisCanvasProps {
  sourceTables: SourceTableProfile[];
  onUpdateSourceTables: (tables: SourceTableProfile[]) => void;
  onAdvanceStage?: () => void;
}

export const Stage1SourceAnalysisCanvas: React.FC<Stage1SourceAnalysisCanvasProps> = ({
  sourceTables,
  onUpdateSourceTables,
  onAdvanceStage
}) => {
  const [activeTab, setActiveTab] = useState<
    "connectors" | "profiler" | "dictionary" | "classification" | "er"
  >("profiler");

  const [searchTerm, setSearchTerm] = useState("");
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [selectedSourceType, setSelectedSourceType] = useState("PostgreSQL");
  
  // Connection credentials state (no mandatory table name or description required)
  const [connHost, setConnHost] = useState("db.prod.enterprise.internal");
  const [connDatabase, setConnDatabase] = useState("oltp_production");
  const [connAuthType, setConnAuthType] = useState("Password");
  const [connUsername, setConnUsername] = useState("admin_svc");
  const [connPassword, setConnPassword] = useState("••••••••••••");
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Inferred relationships state
  const [relationships, setRelationships] = useState<SourceRelationship[]>(() => {
    const rels: SourceRelationship[] = [];
    let counter = 1;
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
                description: `Inferred foreign key from ${col.columnName}`
              });
            }
          }
        }
      });
    });
    return rels;
  });

  const SENSITIVITY_OPTIONS: SensitivityType[] = ["PII", "Non-PII", "PHI", "Sensitive", "N/A"];
  const CLASSIFICATION_OPTIONS: ClassificationType[] = ["Internal", "Restricted", "Confidential", "Public", "N/A"];

  const handleUpdateColumnSensitivity = (
    tableId: string,
    colId: string,
    sensitivity: SensitivityType
  ) => {
    const updated = sourceTables.map((t) => {
      if (t.id === tableId) {
        const newCols = t.columns.map((c) => (c.id === colId ? { ...c, sensitivity } : c));
        return { ...t, columns: newCols };
      }
      return t;
    });
    onUpdateSourceTables(updated);
  };

  const handleUpdateColumnClassification = (
    tableId: string,
    colId: string,
    classification: ClassificationType
  ) => {
    const updated = sourceTables.map((t) => {
      if (t.id === tableId) {
        const newCols = t.columns.map((c) => (c.id === colId ? { ...c, classification } : c));
        return { ...t, columns: newCols };
      }
      return t;
    });
    onUpdateSourceTables(updated);
  };

  const handleUpdateColumnDesc = (tableId: string, colId: string, desc: string) => {
    const updated = sourceTables.map((t) => {
      if (t.id === tableId) {
        const newCols = t.columns.map((c) => (c.id === colId ? { ...c, description: desc } : c));
        return { ...t, columns: newCols };
      }
      return t;
    });
    onUpdateSourceTables(updated);
  };

  const handleConnectSource = () => {
    setIsConnecting(true);
    setTimeout(() => {
      const name = uploadedFileName
        ? uploadedFileName.split(".")[0].toLowerCase().replace(/[^a-z0-9_]/g, "_")
        : `imported_${selectedSourceType.toLowerCase().replace(/[^a-z0-9]/g, "")}_schema`;

      const newTable: SourceTableProfile = {
        id: `src-tbl-${Date.now()}`,
        tableName: name,
        description: `Auto-profiled dataset from ${selectedSourceType} connection (${connHost})`,
        rowCount: 18500,
        columns: [
          {
            id: `col-${Date.now()}-1`,
            tableName: name,
            columnName: "record_id",
            dataType: "BIGINT",
            nullPercentage: 0,
            distinctCount: 18500,
            totalRows: 18500,
            sampleValues: ["10001", "10002", "10003"],
            description: "Surrogate identity key",
            classification: "Operational",
            isPrimaryKey: true
          },
          {
            id: `col-${Date.now()}-2`,
            tableName: name,
            columnName: "connection_ref",
            dataType: "VARCHAR(64)",
            nullPercentage: 0.1,
            distinctCount: 18000,
            totalRows: 18500,
            sampleValues: ["CONN_A90", "CONN_B82"],
            description: "External reference code",
            classification: "Internal"
          },
          {
            id: `col-${Date.now()}-3`,
            tableName: name,
            columnName: "amount_val",
            dataType: "DECIMAL(12,2)",
            nullPercentage: 0,
            distinctCount: 4200,
            totalRows: 18500,
            sampleValues: ["299.99", "1250.00"],
            description: "Financial monetary field",
            classification: "Financial"
          }
        ]
      };

      onUpdateSourceTables([...sourceTables, newTable]);
      setIsConnecting(false);
      setShowConnectModal(false);
      setActiveTab("profiler");
    }, 800);
  };

  // Filtered tables for search
  const filteredTables = sourceTables.filter(
    (t) =>
      t.tableName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.columns.some((c) => c.columnName.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-hidden">
      {/* Canvas Top Bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shadow-2xs shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-50 text-orange-600 rounded-lg border border-orange-200">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-slate-900 text-sm">Source Analysis</h2>
            <p className="text-xs text-slate-500">
              Source profiling, data dictionary, classification & ER relationships
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Export Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all border border-slate-200 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span>Export</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {showExportMenu && (
              <div
                className="absolute right-0 mt-1 w-64 bg-white border border-slate-200 rounded-xl shadow-lg z-50 py-1 text-xs"
                onMouseLeave={() => setShowExportMenu(false)}
              >
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  Select Download Format
                </div>
                <button
                  onClick={() => {
                    exportDataProfilerExcel(sourceTables);
                    setShowExportMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-orange-50 hover:text-orange-700 flex items-center gap-2 text-slate-700 font-medium cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Data Profiler Output (.xlsx)</span>
                </button>
                <button
                  onClick={() => {
                    exportDataDictionaryExcel(sourceTables);
                    setShowExportMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-orange-50 hover:text-orange-700 flex items-center gap-2 text-slate-700 font-medium cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Data Dictionary Output (.xlsx)</span>
                </button>
                <button
                  onClick={() => {
                    exportClassificationExcel(sourceTables);
                    setShowExportMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-orange-50 hover:text-orange-700 flex items-center gap-2 text-slate-700 font-medium cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Classification Output (.xlsx)</span>
                </button>
                <button
                  onClick={() => {
                    exportSourceRelationshipsExcel(relationships);
                    setShowExportMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-orange-50 hover:text-orange-700 flex items-center gap-2 text-slate-700 font-medium cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Source Relationships Output (.xlsx)</span>
                </button>
                <div className="border-t border-slate-100 my-1"></div>
                <button
                  onClick={() => {
                    exportStage1Excel(sourceTables, relationships);
                    setShowExportMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-orange-600 hover:text-white flex items-center gap-2 text-orange-600 font-bold cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>All (Complete Stage 1 Workbook)</span>
                </button>
              </div>
            )}
          </div>

          {onAdvanceStage && (
            <button
              onClick={onAdvanceStage}
              className="px-4 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
            >
              <span>Approve & Proceed to Stage 2</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Navigation Sub-Tabs without numbers */}
      <div className="bg-slate-100/80 border-b border-slate-200 px-6 pt-2 flex items-center gap-2 text-xs overflow-x-auto shrink-0">
        <button
          onClick={() => setActiveTab("connectors")}
          className={`px-3.5 py-2 font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
            activeTab === "connectors"
              ? "border-orange-600 text-orange-600 bg-white rounded-t-lg shadow-2xs"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          <span>Source Connections</span>
        </button>

        <button
          onClick={() => setActiveTab("profiler")}
          className={`px-3.5 py-2 font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
            activeTab === "profiler"
              ? "border-orange-600 text-orange-600 bg-white rounded-t-lg shadow-2xs"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <TableIcon className="w-3.5 h-3.5" />
          <span>Data Profiler</span>
        </button>

        <button
          onClick={() => setActiveTab("dictionary")}
          className={`px-3.5 py-2 font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
            activeTab === "dictionary"
              ? "border-orange-600 text-orange-600 bg-white rounded-t-lg shadow-2xs"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>Data Dictionary</span>
        </button>

        <button
          onClick={() => setActiveTab("classification")}
          className={`px-3.5 py-2 font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
            activeTab === "classification"
              ? "border-orange-600 text-orange-600 bg-white rounded-t-lg shadow-2xs"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          <span>Classification</span>
        </button>

        <button
          onClick={() => setActiveTab("er")}
          className={`px-3.5 py-2 font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
            activeTab === "er"
              ? "border-orange-600 text-orange-600 bg-white rounded-t-lg shadow-2xs"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Source Relationships</span>
        </button>
      </div>

      {/* Tab Content Area */}
      <div className="flex-1 overflow-auto">
        {/* TAB 1: Source Connections */}
        {activeTab === "connectors" && (
          <div className="p-6 max-w-5xl mx-auto space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Source Data Connections</h3>
                  <p className="text-xs text-slate-500">
                    Connect or import source database systems, file feeds, and API endpoints.
                  </p>
                </div>

                <button
                  onClick={() => setShowConnectModal(true)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-2xs flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Import / Connect to Data Source</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3">
                  <div className="p-2 bg-blue-100 text-blue-700 rounded-lg shrink-0">
                    <Database className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-slate-800">PostgreSQL OLTP</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">orders_db.public</p>
                    <span className="inline-block mt-2 text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">
                      Connected (Active)
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3">
                  <div className="p-2 bg-amber-100 text-amber-700 rounded-lg shrink-0">
                    <Cloud className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-slate-800">Salesforce CRM API</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">Account & Contact Objects</p>
                    <span className="inline-block mt-2 text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">
                      Synced
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3">
                  <div className="p-2 bg-purple-100 text-purple-700 rounded-lg shrink-0">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-slate-800">S3 Data Lake Files</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">Parquet & CSV Landing</p>
                    <span className="inline-block mt-2 text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">
                      Loaded
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Active Source Datasets (Sample Data Used) */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
              <h3 className="font-bold text-slate-800 text-sm mb-3">
                Active Source Datasets (Sample Data Used) ({sourceTables.length} Tables)
              </h3>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                {sourceTables.map((tbl) => (
                  <div key={tbl.id} className="p-3 bg-white hover:bg-slate-50 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-slate-900">{tbl.tableName}</span>
                      <span className="text-slate-500 text-[11px]">{tbl.description}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-slate-600 text-[11px] bg-slate-100 px-2 py-0.5 rounded">
                        {tbl.rowCount.toLocaleString()} rows
                      </span>
                      <span className="font-mono text-slate-600 text-[11px] bg-slate-100 px-2 py-0.5 rounded">
                        {tbl.columns.length} columns
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Data Profiler */}
        {activeTab === "profiler" && (
          <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter table or column name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-orange-500 shadow-2xs"
                />
              </div>
            </div>

            <div className="space-y-6">
              {filteredTables.map((tbl) => (
                <div key={tbl.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                  <div className="bg-orange-50/90 text-orange-950 border-b border-orange-200 px-4 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Database className="w-4 h-4 text-orange-600" />
                      <span className="font-mono font-bold text-xs text-slate-900">{tbl.tableName}</span>
                      <span className="text-[11px] text-slate-500 font-sans">({tbl.description})</span>
                    </div>
                    <span className="text-[11px] font-mono text-orange-800 bg-orange-100/60 border border-orange-200 px-2 py-0.5 rounded font-bold">
                      Total Rows: {tbl.rowCount.toLocaleString()}
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold border-b border-slate-200">
                        <tr>
                          <th className="p-2.5">Column Name</th>
                          <th className="p-2.5">Data Type</th>
                          <th className="p-2.5">Null %</th>
                          <th className="p-2.5">Distinct Count</th>
                          <th className="p-2.5">Sample Values</th>
                          <th className="p-2.5">Description</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono">
                        {tbl.columns.map((col) => (
                          <tr key={col.id} className="hover:bg-slate-50/80">
                            <td className="p-2.5 font-bold text-slate-900 flex items-center gap-1.5">
                              {col.isPrimaryKey && (
                                <span className="text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1 rounded">
                                  PK
                                </span>
                              )}
                              {col.isForeignKey && (
                                <span className="text-[9px] font-bold text-orange-700 bg-orange-50 border border-orange-200 px-1 rounded">
                                  FK
                                </span>
                              )}
                              <span>{col.columnName}</span>
                            </td>
                            <td className="p-2.5 text-slate-600">{col.dataType}</td>
                            <td className="p-2.5 text-slate-700">{col.nullPercentage}%</td>
                            <td className="p-2.5 text-slate-700">{col.distinctCount.toLocaleString()}</td>
                            <td className="p-2.5 text-slate-500 font-sans text-[11px] max-w-xs truncate">
                              {col.sampleValues.join(", ")}
                            </td>
                            <td className="p-2.5 text-slate-600 font-sans text-[11px]">{col.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: Data Dictionary */}
        {activeTab === "dictionary" && (
          <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="space-y-6">
              {filteredTables.map((tbl) => (
                <div key={tbl.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                  <div className="bg-orange-50/90 text-orange-950 border-b border-orange-200 px-4 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4 text-orange-600" />
                      <span className="font-mono font-bold text-xs text-slate-900">{tbl.tableName}</span>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold border-b border-slate-200">
                        <tr>
                          <th className="p-2.5">Column</th>
                          <th className="p-2.5">Data Type</th>
                          <th className="p-2.5">Key Type</th>
                          <th className="p-2.5">Business Definition / Description</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {tbl.columns.map((col) => (
                          <tr key={col.id} className="hover:bg-slate-50">
                            <td className="p-2.5 font-mono font-bold text-slate-900">{col.columnName}</td>
                            <td className="p-2.5 font-mono text-slate-600">{col.dataType}</td>
                            <td className="p-2.5 font-mono">
                              {col.isPrimaryKey ? (
                                <span className="text-amber-700 font-bold bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded text-[10px]">
                                  PRIMARY KEY
                                </span>
                              ) : col.isForeignKey ? (
                                <span className="text-orange-700 font-bold bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded text-[10px]">
                                  FOREIGN KEY
                                </span>
                              ) : (
                                <span className="text-slate-400 text-[10px]">ATTRIBUTE</span>
                              )}
                            </td>
                            <td className="p-2.5">
                              <input
                                type="text"
                                value={col.description}
                                onChange={(e) => handleUpdateColumnDesc(tbl.id, col.id, e.target.value)}
                                className="w-full p-1 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-orange-500 focus:outline-none text-slate-800"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: Classification */}
        {activeTab === "classification" && (
          <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="space-y-6">
              {filteredTables.map((tbl) => (
                <div key={tbl.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                  <div className="bg-orange-50/90 text-orange-950 border-b border-orange-200 px-4 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-orange-600" />
                      <span className="font-mono font-bold text-xs text-slate-900">{tbl.tableName}</span>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold border-b border-slate-200">
                        <tr>
                          <th className="p-2.5">Column Name</th>
                          <th className="p-2.5">Data Type</th>
                          <th className="p-2.5">Sensitivity (PII, Non-PII, PHI, Sensitive, N/A)</th>
                          <th className="p-2.5">Classification (Internal, Restricted, Confidential, Public, N/A)</th>
                          <th className="p-2.5">Masking Strategy</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono">
                        {tbl.columns.map((col) => (
                          <tr key={col.id} className="hover:bg-slate-50">
                            <td className="p-2.5 font-bold text-slate-900">{col.columnName}</td>
                            <td className="p-2.5 text-slate-600">{col.dataType}</td>
                            <td className="p-2.5">
                              <select
                                value={col.sensitivity || "N/A"}
                                onChange={(e) =>
                                  handleUpdateColumnSensitivity(
                                    tbl.id,
                                    col.id,
                                    e.target.value as SensitivityType
                                  )
                                }
                                className={`p-1 border rounded text-xs font-bold focus:outline-none cursor-pointer ${
                                  col.sensitivity === "PII" || col.sensitivity === "PHI"
                                    ? "bg-rose-50 text-rose-700 border-rose-300"
                                    : col.sensitivity === "Sensitive"
                                    ? "bg-amber-50 text-amber-700 border-amber-300"
                                    : "bg-slate-50 text-slate-700 border-slate-200"
                                }`}
                              >
                                {SENSITIVITY_OPTIONS.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="p-2.5">
                              <select
                                value={col.classification || "Internal"}
                                onChange={(e) =>
                                  handleUpdateColumnClassification(
                                    tbl.id,
                                    col.id,
                                    e.target.value as ClassificationType
                                  )
                                }
                                className={`p-1 border rounded text-xs font-bold focus:outline-none cursor-pointer ${
                                  col.classification === "Confidential" || col.classification === "Restricted"
                                    ? "bg-purple-50 text-purple-700 border-purple-300"
                                    : "bg-slate-50 text-slate-700 border-slate-200"
                                }`}
                              >
                                {CLASSIFICATION_OPTIONS.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="p-2.5 font-sans text-slate-500">
                              {col.sensitivity === "PII"
                                ? "SHA-256 Hash / Redact"
                                : col.sensitivity === "PHI"
                                ? "HIPAA Tokenization"
                                : "None"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 5: ER Diagram */}
        {activeTab === "er" && (
          <SourceDiagramCanvas
            sourceTables={sourceTables}
            onUpdateSourceTables={onUpdateSourceTables}
            relationships={relationships}
            onUpdateRelationships={setRelationships}
            onAdvanceStage={onAdvanceStage}
          />
        )}
      </div>

      {/* Import / Connect Data Source Modal */}
      {showConnectModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden">
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Link2 className="w-4 h-4 text-orange-400" />
                <h3 className="font-bold text-sm">Import / Connect Data Source</h3>
              </div>
              <button onClick={() => setShowConnectModal(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Source Connection Type</label>
                <select
                  value={selectedSourceType}
                  onChange={(e) => setSelectedSourceType(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 font-bold focus:outline-none focus:ring-1 focus:ring-orange-500 cursor-pointer"
                >
                  <option value="PostgreSQL">🐘 PostgreSQL / MySQL / SQL Server</option>
                  <option value="Snowflake">❄️ Snowflake / BigQuery / Databricks</option>
                  <option value="Salesforce">☁️ Salesforce / REST API Endpoint</option>
                  <option value="CSV">📄 Upload File (CSV, Excel, DDL, Parquet)</option>
                </select>
              </div>

              {selectedSourceType === "CSV" ? (
                <div className="space-y-2">
                  <label className="block text-slate-700 font-bold">File Upload</label>
                  <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center bg-slate-50 hover:border-orange-400 transition-colors relative cursor-pointer">
                    <input
                      type="file"
                      accept=".csv,.xlsx,.parquet,.sql,.ddl,.json"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          setUploadedFileName(e.target.files[0].name);
                        }
                      }}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                    <Upload className="w-8 h-8 text-orange-500 mx-auto mb-2" />
                    <p className="text-slate-700 font-semibold text-xs">
                      {uploadedFileName ? (
                        <span className="text-emerald-600 font-mono font-bold">Loaded: {uploadedFileName}</span>
                      ) : (
                        "Drag & drop file here or click to browse"
                      )}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1">Supports CSV, Excel, Parquet, JSON or DDL schemas</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Host / Connection URL</label>
                    <input
                      type="text"
                      value={connHost}
                      onChange={(e) => setConnHost(e.target.value)}
                      placeholder="e.g. jdbc:postgresql://db.prod.internal:5432/main"
                      className="w-full p-2 border border-slate-300 rounded-lg font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-orange-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">Database / Schema</label>
                      <input
                        type="text"
                        value={connDatabase}
                        onChange={(e) => setConnDatabase(e.target.value)}
                        placeholder="e.g. analytics_db"
                        className="w-full p-2 border border-slate-300 rounded-lg font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-orange-500"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">Authentication</label>
                      <select
                        value={connAuthType}
                        onChange={(e) => setConnAuthType(e.target.value)}
                        className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-orange-500 cursor-pointer"
                      >
                        <option value="Password">Username & Password</option>
                        <option value="OAuth2">OAuth2 / IAM Token</option>
                        <option value="ServiceKey">Service Account Key</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">User Name</label>
                      <input
                        type="text"
                        value={connUsername}
                        onChange={(e) => setConnUsername(e.target.value)}
                        placeholder="Username"
                        className="w-full p-2 border border-slate-300 rounded-lg font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-orange-500"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">Password / Key</label>
                      <input
                        type="password"
                        value={connPassword}
                        onChange={(e) => setConnPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className="w-full p-2 border border-slate-300 rounded-lg font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-orange-500"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-slate-50 p-4 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setShowConnectModal(false)}
                className="px-3.5 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConnectSource}
                disabled={isConnecting}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isConnecting ? (
                  <span>Analyzing Data Source...</span>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Analyze</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
