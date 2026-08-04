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
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setIsUploading(true);
    try {
      const rawFile = await uploadsApi.upload(file, projectId);
      onUploaded(rawFile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.tsv,.xlsx,.xls"
        onChange={handleFileChosen}
        className="hidden"
        id="chat-file-upload-input"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={isUploading}
        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
        title="Attach a source file (.csv/.tsv/.xlsx/.xls)"
      >
        <Paperclip className="w-3.5 h-3.5" />
      </button>
      {isUploading && (
        <span className="absolute left-full ml-1.5 top-1.5 text-[10px] font-semibold text-slate-400 whitespace-nowrap">
          Uploading...
        </span>
      )}
      {error && (
        <span className="absolute left-full ml-1.5 top-1.5 text-[10px] font-semibold text-rose-600 whitespace-nowrap">
          {error}
        </span>
      )}
    </div>
  );
};
