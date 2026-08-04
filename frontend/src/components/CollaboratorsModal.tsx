import React, { useEffect, useState } from "react";
import { Crown, Plus, Users, X } from "lucide-react";
import { collaboratorsApi } from "../api/client";
import type { Collaborator, Project } from "../types";
import { useAuth } from "../auth/AuthContext";
import { useWorkspace } from "../workspace/WorkspaceContext";

interface Props {
  project: Project;
  onClose: () => void;
}

export const CollaboratorsModal: React.FC<Props> = ({ project, onClose }) => {
  const { user } = useAuth();
  const { refreshActiveProject } = useWorkspace();
  const isOwner = project.owner_user_id === user?.user_id;
  const [collaborators, setCollaborators] = useState<Collaborator[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newUsername, setNewUsername] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const load = () => {
    collaboratorsApi
      .list(project.project_id)
      .then(setCollaborators)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load collaborators."));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.project_id]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const username = newUsername.trim();
    if (!username) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await collaboratorsApi.add(project.project_id, username);
      setNewUsername("");
      load();
      refreshActiveProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add that user — check the username.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemove = async (userId: string) => {
    setError(null);
    try {
      await collaboratorsApi.remove(project.project_id, userId);
      load();
      refreshActiveProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove collaborator.");
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-2xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
        <div className="bg-brand-orange-light border-b border-brand-orange/20 p-4 px-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-brand-orange" />
            <h3 className="font-extrabold text-sm text-slate-900">Collaborators</h3>
          </div>
          <button onClick={onClose} title="Close" className="text-slate-400 hover:text-slate-700 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3 text-xs max-h-[60vh] overflow-y-auto">
          {error && (
            <div className="text-[11px] font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
              {error}
            </div>
          )}

          {collaborators === null && <p className="text-slate-400">Loading...</p>}

          {collaborators?.map((c) => (
            <div
              key={c.user_id}
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 h-6 rounded-full bg-brand-orange text-white font-bold text-[10px] flex items-center justify-center shrink-0">
                  {c.username.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-slate-800 truncate">{c.username}</div>
                  {c.email && <div className="text-[10px] text-slate-400 truncate">{c.email}</div>}
                </div>
              </div>
              {c.is_owner ? (
                <span className="flex items-center gap-1 text-[10px] font-bold text-brand-orange px-2 py-0.5 rounded-full bg-white border border-brand-orange/30 shrink-0">
                  <Crown className="w-3 h-3" /> Owner
                </span>
              ) : (
                isOwner && (
                  <button
                    onClick={() => handleRemove(c.user_id)}
                    className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer shrink-0"
                    title="Remove"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )
              )}
            </div>
          ))}
        </div>

        {isOwner && (
          <form onSubmit={handleAdd} className="p-4 border-t border-slate-100 flex items-center gap-2">
            <input
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="Add by username"
              className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange"
            />
            <button
              type="submit"
              disabled={!newUsername.trim() || isSubmitting}
              className="p-2 rounded-xl bg-brand-orange hover:bg-brand-orange-hover disabled:opacity-50 text-white cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
