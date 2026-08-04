import React, { useEffect, useState } from "react";
import { BookOpen, X } from "lucide-react";
import { kbApi } from "../api/client";
import type { Citation, KbDocumentDetail } from "../types";

interface Props {
  citation: Citation;
  onClose: () => void;
}

export const ViewSourceModal: React.FC<Props> = ({ citation, onClose }) => {
  const [doc, setDoc] = useState<KbDocumentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    kbApi
      .getDocument(citation.source_doc_id)
      .then(setDoc)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load source document."));
  }, [citation.source_doc_id]);

  const before = doc ? doc.full_text.slice(0, citation.char_start) : "";
  const highlighted = doc ? doc.full_text.slice(citation.char_start, citation.char_end) : "";
  const after = doc ? doc.full_text.slice(citation.char_end) : "";

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-2xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="bg-purple-50 border-b border-purple-200 p-4 px-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <BookOpen className="w-4 h-4 text-purple-600 shrink-0" />
            <h3 className="font-extrabold text-sm text-slate-900 truncate">{citation.title}</h3>
          </div>
          <button onClick={onClose} title="Close" className="text-slate-400 hover:text-slate-700 cursor-pointer shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto text-xs">
          {error && (
            <div className="text-[11px] font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
              {error}
            </div>
          )}
          {!doc && !error && <p className="text-slate-400 text-center py-8">Loading source document...</p>}
          {doc && (
            <pre className="whitespace-pre-wrap font-sans text-slate-600 leading-relaxed">
              {before}
              <mark className="bg-amber-200 text-slate-900 rounded px-0.5">{highlighted}</mark>
              {after}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
};
