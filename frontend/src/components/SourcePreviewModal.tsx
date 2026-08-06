import React, { useEffect, useState } from "react";
import { BookOpen, X } from "lucide-react";
import { kbApi } from "../api/client";
import type { Citation, KbDocumentDetail } from "../types";
import { ArtifactMarkdown } from "./canvas/renderers/ArtifactMarkdown";
import { RecordArrayTable } from "./canvas/TaskOutputRenderer";

interface Props {
  citation: Citation;
  onClose: () => void;
}

type PreviewMode = "loading" | "pdf" | "table" | "markdown" | "text" | "error";

/**
 * Replaces ViewSourceModal.tsx — same text-with-highlight fallback for
 * anything without a native preview (docs ingested before the blob-storage
 * change, or any format that isn't pdf/csv/xlsx/md), but branches into a
 * real native preview when the document's original bytes were stored:
 * a .pdf renders in a real embedded PDF viewer (native <iframe>, zero
 * client-side PDF-parsing dependency), a .csv/.xlsx renders as a real
 * table (reusing TaskOutputRenderer's RecordArrayTable, not a new
 * table-rendering implementation), a .md/.markdown routes through the
 * same ArtifactMarkdown renderer every other markdown surface in this app
 * already uses.
 */
export const SourcePreviewModal: React.FC<Props> = ({ citation, onClose }) => {
  const [doc, setDoc] = useState<KbDocumentDetail | null>(null);
  const [mode, setMode] = useState<PreviewMode>("loading");
  const [error, setError] = useState<string | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [tableData, setTableData] = useState<{ columns: string[]; rows: Record<string, unknown>[] } | null>(null);

  useEffect(() => {
    let revokeUrl: string | null = null;
    let cancelled = false;

    (async () => {
      try {
        const d = await kbApi.getDocument(citation.source_doc_id);
        if (cancelled) return;
        setDoc(d);

        const ext = (d.original_extension || "").toLowerCase();
        if (d.has_native_preview && ext === ".pdf") {
          const { url } = await kbApi.fetchFileBlobUrl(citation.source_doc_id);
          if (cancelled) return;
          revokeUrl = url;
          setPdfBlobUrl(url);
          setMode("pdf");
          return;
        }
        if (d.has_native_preview && (ext === ".csv" || ext === ".xlsx")) {
          const preview = await kbApi.getTablePreview(citation.source_doc_id);
          if (cancelled) return;
          setTableData(preview);
          setMode("table");
          return;
        }
        if (ext === ".md" || ext === ".markdown") {
          setMode("markdown");
          return;
        }
        setMode("text");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load source document.");
          setMode("error");
        }
      }
    })();

    return () => {
      cancelled = true;
      if (revokeUrl) URL.revokeObjectURL(revokeUrl);
    };
  }, [citation.source_doc_id]);

  const before = doc ? doc.full_text.slice(0, citation.char_start) : "";
  const highlighted = doc ? doc.full_text.slice(citation.char_start, citation.char_end) : "";
  const after = doc ? doc.full_text.slice(citation.char_end) : "";

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-2xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="bg-slate-50 border-b border-slate-200 p-4 px-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <BookOpen className="w-4 h-4 text-brand-orange shrink-0" />
            <h3 className="font-extrabold text-sm text-slate-900 truncate">{citation.title}</h3>
          </div>
          <button onClick={onClose} title="Close" className="text-slate-400 hover:text-slate-700 cursor-pointer shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className={`overflow-y-auto text-xs flex-1 min-h-0 ${mode === "pdf" ? "p-0" : "p-5"}`}>
          {mode === "loading" && <p className="text-slate-400 text-center py-8">Loading source document...</p>}
          {mode === "error" && (
            <div className="text-[11px] font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
              {error}
            </div>
          )}
          {mode === "pdf" && pdfBlobUrl && (
            <iframe src={pdfBlobUrl} title={citation.title} className="w-full h-[70vh] border-0" />
          )}
          {mode === "table" && tableData && (
            tableData.rows.length > 0 ? (
              <RecordArrayTable rows={tableData.rows} />
            ) : (
              <p className="text-slate-400 text-center py-8">No rows found in this file.</p>
            )
          )}
          {mode === "markdown" && doc && <ArtifactMarkdown text={doc.full_text} />}
          {mode === "text" && doc && (
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
