import React, { useRef, useState } from "react";
import { Paperclip } from "lucide-react";
import { uploadsApi } from "../api/client";
import type { RawFile } from "../types";

interface Props {
  projectId?: string;
  onUploaded: (file: RawFile) => void;
}

export const FileUploadPicker: React.FC<Props> = ({ projectId, onUploaded }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setError(null);
    setIsUploading(true);
    const failed: string[] = [];
    // Sequential, not Promise.all — keeps upload order stable so chips
    // appear in the order the user picked them, and one bad file's error
    // message doesn't get lost among several in-flight requests.
    for (const file of files) {
      try {
        const rawFile = await uploadsApi.upload(file, projectId);
        onUploaded(rawFile);
      } catch (err) {
        failed.push(`${file.name}: ${err instanceof Error ? err.message : "upload failed"}`);
      }
    }
    if (failed.length > 0) setError(failed.join("; "));
    setIsUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".csv,.tsv,.xlsx,.xls"
        onChange={handleFileChosen}
        className="hidden"
        id="chat-file-upload-input"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={isUploading}
        className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-bold text-slate-600 hover:border-slate-300 hover:bg-slate-100 transition cursor-pointer disabled:opacity-50"
        title="Attach source file(s) (.csv/.tsv/.xlsx/.xls)"
      >
        <Paperclip className="w-3 h-3" />
        {isUploading ? "Uploading..." : "Attach files"}
      </button>
      {error && (
        <span className="absolute left-0 top-full mt-1 text-[10px] font-semibold text-rose-600 whitespace-nowrap z-10">
          {error}
        </span>
      )}
    </div>
  );
};
