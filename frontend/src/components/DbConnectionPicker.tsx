import React, { useEffect, useState } from "react";
import { Database, Plus, X } from "lucide-react";
import { dbConnectionsApi } from "../api/client";
import type { DbConnection } from "../types";

interface Props {
  projectId: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

const DIALECT_OPTIONS = ["postgresql", "mysql", "sqlite", "mssql", "oracle"];

export const DbConnectionPicker: React.FC<Props> = ({ projectId, selectedId, onSelect }) => {
  const [connections, setConnections] = useState<DbConnection[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [dialect, setDialect] = useState(DIALECT_OPTIONS[0]);
  const [dsnRef, setDsnRef] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dbConnectionsApi.list(projectId).then(setConnections).catch(() => {});
  }, [projectId]);

  const selected = connections.find((c) => c.db_connection_id === selectedId) || null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dsnRef.trim()) return;
    setError(null);
    setIsCreating(true);
    try {
      const conn = await dbConnectionsApi.create(projectId, dialect, dsnRef.trim());
      setConnections((prev) => [conn, ...prev]);
      onSelect(conn.db_connection_id);
      setShowCreateForm(false);
      setDsnRef("");
      setIsOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create connection.");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
          selected ? "bg-blue-50 text-blue-700" : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
        }`}
        title="Attach a database table"
      >
        <Database className="w-3.5 h-3.5" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute bottom-full mb-1.5 left-0 w-64 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-2 space-y-1 text-xs">
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 px-1.5 pt-0.5">
              Database Connections
            </div>
            {connections.map((c) => (
              <button
                key={c.db_connection_id}
                type="button"
                onClick={() => {
                  onSelect(c.db_connection_id === selectedId ? null : c.db_connection_id);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-2 py-1.5 rounded-lg cursor-pointer truncate ${
                  c.db_connection_id === selectedId
                    ? "bg-blue-50 text-blue-700 font-bold"
                    : "hover:bg-slate-100 text-slate-700"
                }`}
                title={`${c.dialect} — ${c.dsn_ref}`}
              >
                {c.dialect} — {c.dsn_ref}
              </button>
            ))}
            {connections.length === 0 && !showCreateForm && (
              <p className="px-2 py-1 text-slate-400">No connections yet.</p>
            )}
            {!showCreateForm ? (
              <button
                type="button"
                onClick={() => setShowCreateForm(true)}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-brand-orange hover:bg-brand-orange-light font-bold cursor-pointer"
              >
                <Plus className="w-3 h-3" /> New connection
              </button>
            ) : (
              <form onSubmit={handleCreate} className="space-y-1.5 pt-1 border-t border-slate-100">
                <select
                  value={dialect}
                  onChange={(e) => setDialect(e.target.value)}
                  className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer"
                >
                  {DIALECT_OPTIONS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={dsnRef}
                  onChange={(e) => setDsnRef(e.target.value)}
                  placeholder="Env var name holding the DSN"
                  autoFocus
                  className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg"
                />
                {error && <p className="text-rose-600 font-semibold">{error}</p>}
                <div className="flex gap-1.5">
                  <button
                    type="submit"
                    disabled={isCreating || !dsnRef.trim()}
                    className="flex-1 px-2 py-1.5 rounded-lg bg-brand-orange text-white font-bold disabled:opacity-50 cursor-pointer"
                  >
                    {isCreating ? "Adding..." : "Add"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="px-2 py-1.5 rounded-lg bg-slate-100 text-slate-600 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </form>
            )}
          </div>
        </>
      )}
    </div>
  );
};
