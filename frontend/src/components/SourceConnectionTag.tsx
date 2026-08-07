import React, { useEffect, useState } from "react";
import { Database, X } from "lucide-react";
import { dbConnectionsApi } from "../api/client";
import type { DbConnection } from "../types";

interface Props {
  projectId: string;
}

// Small tag, top-left of the project chat header (Phase 4) — appears once
// the project's DB connection (set at project creation, see
// CreateProjectCanvas.tsx) is known. Clicking shows the connection details
// the user gave (never the password — see routes_db_connections.py's
// ADM_DbConnection.public()).
export const SourceConnectionTag: React.FC<Props> = ({ projectId }) => {
  const [connection, setConnection] = useState<DbConnection | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    dbConnectionsApi
      .list(projectId)
      .then((conns) => setConnection(conns[0] ?? null))
      .catch(() => setConnection(null));
  }, [projectId]);

  if (!connection) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShowDetails((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold cursor-pointer hover:bg-emerald-100 transition-colors"
        title="View connected data source"
      >
        <Database className="w-3.5 h-3.5" />
        <span className="max-w-[140px] truncate">{connection.database}</span>
      </button>

      {showDetails && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowDetails(false)} />
          <div className="absolute left-0 top-full mt-2 w-72 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-4 text-xs">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-slate-900">Data Source</h3>
              <button onClick={() => setShowDetails(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2">
              {([
                ["Dialect", connection.dialect],
                ["Host", connection.host],
                ["Port", String(connection.port)],
                ["Database", connection.database],
                ["Username", connection.username],
              ] as const).map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3">
                  <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">{label}</span>
                  <span className="text-slate-700 font-mono truncate max-w-[150px]" title={value}>
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
