import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, BookOpen, Copy, Database, FileText, Layers, RefreshCcw, User, Wrench } from "lucide-react";
import type { ChatArtifact, ChatMessage, Citation, ReasoningEvent } from "../../types";
import { markdownComponents } from "../canvas/renderers/ArtifactMarkdown";
import { ActionIcon } from "./ActionIcon";
import { ReasoningAccordion } from "./ReasoningAccordion";
import { ArtifactChip, ArtifactChipPlaceholder } from "./ArtifactChip";

interface Props {
  message: ChatMessage;
  isLatestAssistant: boolean;
  reasoningEventsForThisTurn: ReasoningEvent[];
  isStreamingThisTurn: boolean;
  onCopy: (text: string) => void;
  onRegenerate: () => void;
  onSelectCitation: (c: Citation) => void;
  onFollowUpClick: (question: string) => void;
  artifacts: ChatArtifact[];
  activeArtifactId: string | null;
  onSelectArtifact: (id: string) => void;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Sources icon + dropdown — replaces the earlier separate blue
 * (matched_skills) and purple (citations) chip rows with a single neutral
 * action-row icon, matching the "no blue/purple chrome, one accent color"
 * direction. Lists matched skills (informational) and citations (clickable
 * -> opens SourcePreviewModal) as plain rows in a floating card, not
 * colored chips.
 */
const SourcesDropdown: React.FC<{
  message: ChatMessage;
  onSelectCitation: (c: Citation) => void;
}> = ({ message, onSelectCitation }) => {
  const [isOpen, setIsOpen] = useState(false);
  const skills = message.matched_skills || [];
  const citations = message.citations || [];
  if (skills.length === 0 && citations.length === 0) return null;

  return (
    <div className="relative">
      <ActionIcon
        icon={<Layers className="w-3 h-3" />}
        title={`Sources & matched skills (${skills.length + citations.length})`}
        onClick={() => setIsOpen((v) => !v)}
      />
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute bottom-full mb-1.5 left-0 w-72 max-h-80 overflow-y-auto bg-white border border-slate-200 rounded-2xl shadow-lg backdrop-blur-xl z-50 p-1.5 text-xs">
            {skills.length > 0 && (
              <div className="px-1.5 pt-1 pb-0.5">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Matched Skills</div>
                {skills.map((s) => (
                  <div key={s.skill_id} title={s.purpose} className="flex items-center gap-1.5 px-1.5 py-1.5 rounded-lg text-slate-700">
                    <Wrench className="w-3 h-3 text-slate-400 shrink-0" />
                    <span className="font-semibold truncate">{s.title}</span>
                  </div>
                ))}
              </div>
            )}
            {citations.length > 0 && (
              <div className="px-1.5 pt-1 pb-0.5 border-t border-slate-100">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Citations</div>
                {citations.map((c, cIdx) => (
                  <button
                    key={cIdx}
                    onClick={() => {
                      onSelectCitation(c);
                      setIsOpen(false);
                    }}
                    title={c.snippet}
                    className="w-full flex items-center gap-1.5 px-1.5 py-1.5 rounded-lg text-left text-slate-700 hover:bg-brand-orange-light hover:text-brand-orange cursor-pointer transition-colors"
                  >
                    <BookOpen className="w-3 h-3 shrink-0" />
                    <span className="font-semibold truncate">{c.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

/**
 * Attachment card(s) shown above a sent user message — previously an
 * attached file only ever showed as a chip in the composer BEFORE send,
 * then vanished from history entirely (Phase 4 fix). Matches how
 * Claude/ChatGPT show an attached file as a small card alongside the
 * message, not folded into the text.
 */
const AttachmentCards: React.FC<{ fileRefs: NonNullable<ChatMessage["file_refs"]> }> = ({ fileRefs }) => (
  <div className="flex flex-wrap justify-end gap-1.5">
    {fileRefs.map((ref, idx) => {
      const isDb = !!ref.db_connection_id;
      const label = isDb ? "Database connection" : ref.original_filename || ref.raw_file_id || "Attached file";
      return (
        <span
          key={idx}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-700"
        >
          {isDb ? <Database className="w-3.5 h-3.5 text-slate-400" /> : <FileText className="w-3.5 h-3.5 text-slate-400" />}
          <span className="truncate max-w-[160px]">{label}</span>
          {typeof ref.row_count === "number" && <span className="text-slate-400 font-normal">({ref.row_count} rows)</span>}
        </span>
      );
    })}
  </div>
);

/**
 * One chip per artifact_id this message announced (a completed stage's
 * outputs) — resolved against ChatWorkspace's `artifacts` state, which is
 * hydrated from both the live WS stream and GET /chats/{id}/artifacts on
 * reload, so a chip clicked long after the run finishes still opens the
 * right artifact. Clicking always opens the canvas directly on that exact
 * artifact — no separate graph/plan picker to fight with the click.
 */
const ArtifactChips: React.FC<{
  artifactIds: string[];
  artifacts: ChatArtifact[];
  activeArtifactId: string | null;
  onSelectArtifact: (id: string) => void;
}> = ({ artifactIds, artifacts, activeArtifactId, onSelectArtifact }) => (
  <div className="flex flex-wrap gap-1.5 pt-0.5">
    {artifactIds.map((id) => {
      const artifact = artifacts.find((a) => a.artifact_id === id);
      return artifact ? (
        <ArtifactChip key={id} artifact={artifact} isActive={id === activeArtifactId} onClick={() => onSelectArtifact(id)} />
      ) : (
        <ArtifactChipPlaceholder key={id} />
      );
    })}
  </div>
);

/**
 * Borderless, full-width message layout — replaces the old rounded
 * chat-bubble-with-background treatment. Matches the structural pattern
 * modern AI chat products (Claude, ChatGPT, Cursor) converged on: avatar +
 * full-width text, no bubble box, with a hover-revealed action row below
 * the content rather than baked into a colored bubble or always visible.
 */
export const MessageBubble: React.FC<Props> = ({
  message,
  isLatestAssistant,
  reasoningEventsForThisTurn,
  isStreamingThisTurn,
  onCopy,
  onRegenerate,
  onSelectCitation,
  onFollowUpClick,
  artifacts,
  activeArtifactId,
  onSelectArtifact,
}) => {
  if (message.role === "user") {
    return (
      <div className="group flex justify-end gap-2.5">
        <div className="max-w-[85%] text-right space-y-1.5">
          <div className="flex items-center justify-end gap-2 text-[10px] text-slate-400">
            <span>{formatTime(message.created_at)}</span>
            <span className="font-bold text-slate-500">You</span>
          </div>
          {message.file_refs && message.file_refs.length > 0 && <AttachmentCards fileRefs={message.file_refs} />}
          <div className="inline-block text-left rounded-3xl bg-brand-orange px-4 py-2.5 text-xs font-medium text-white leading-relaxed shadow-sm [&_p]:m-0 [&_a]:text-white [&_a]:underline [&_strong]:text-white [&_code]:bg-white/20 [&_code]:text-white">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {message.content}
            </ReactMarkdown>
          </div>
          <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
            <ActionIcon icon={<Copy className="w-3 h-3" />} title="Copy message" onClick={() => onCopy(message.content)} />
          </div>
        </div>
        <div className="w-7 h-7 rounded-lg bg-slate-200 text-slate-700 flex items-center justify-center shrink-0 border border-slate-300 mt-1 shadow-2xs">
          <User className="w-4 h-4" />
        </div>
      </div>
    );
  }

  return (
    <div className="group flex gap-2.5">
      <div className="w-7 h-7 rounded-lg bg-brand-orange-light text-brand-orange flex items-center justify-center shrink-0 border border-brand-orange/20 mt-1 shadow-2xs">
        <Bot className="w-4 h-4" />
      </div>
      <div className="max-w-[85%] min-w-0 space-y-2">
        <div className="flex items-center gap-2 text-[10px] text-slate-400">
          <span className="font-bold text-slate-500">Modeling Assistant</span>
          <span>{formatTime(message.created_at)}</span>
        </div>

        {reasoningEventsForThisTurn.length > 0 && (
          <ReasoningAccordion events={reasoningEventsForThisTurn} isStreaming={isStreamingThisTurn} />
        )}

        {message.content && (
          <div className="text-xs text-slate-800 leading-relaxed [&_p]:m-0 [&_p+p]:mt-2">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        {message.artifact_ids && message.artifact_ids.length > 0 && (
          <ArtifactChips
            artifactIds={message.artifact_ids}
            artifacts={artifacts}
            activeArtifactId={activeArtifactId}
            onSelectArtifact={onSelectArtifact}
          />
        )}

        {message.follow_up_questions && message.follow_up_questions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {message.follow_up_questions.map((q, qIdx) => (
              <button
                key={qIdx}
                onClick={() => onFollowUpClick(q)}
                className="px-2.5 py-1 rounded-full bg-slate-50 hover:bg-brand-orange-light border border-slate-200 hover:border-brand-orange text-[10px] font-semibold text-slate-600 hover:text-brand-orange transition-all cursor-pointer"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {!isStreamingThisTurn && message.content && (
          <div className="flex items-center gap-1 pt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <ActionIcon icon={<Copy className="w-3 h-3" />} title="Copy response" onClick={() => onCopy(message.content)} />
            {isLatestAssistant && (
              <ActionIcon icon={<RefreshCcw className="w-3 h-3" />} title="Regenerate response" onClick={onRegenerate} />
            )}
            <SourcesDropdown message={message} onSelectCitation={onSelectCitation} />
          </div>
        )}
      </div>
    </div>
  );
};
