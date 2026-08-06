import React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import sql from "react-syntax-highlighter/dist/esm/languages/prism/sql";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";

SyntaxHighlighter.registerLanguage("sql", sql);
SyntaxHighlighter.registerLanguage("yaml", yaml);

interface Props {
  text: string;
}

// Same table Tailwind classes TaskOutputRenderer already uses, so a GFM
// table inside a business-standards doc looks identical to a task-output
// table — one visual language, not two. Exported so MessageBubble.tsx can
// reuse it directly for chat answer text — one markdown visual language
// everywhere it renders in this app, not two.
export const markdownComponents: Components = {
  code({ className, children, ...rest }) {
    const match = /language-(\w+)/.exec(className || "");
    const codeText = String(children).replace(/\n$/, "");
    if (match && (match[1] === "sql" || match[1] === "yaml")) {
      return (
        <SyntaxHighlighter
          language={match[1]}
          style={oneLight}
          customStyle={{ margin: 0, borderRadius: "0.5rem", fontSize: "11px", padding: "0.75rem" }}
        >
          {codeText}
        </SyntaxHighlighter>
      );
    }
    return (
      <code className="px-1 py-0.5 rounded bg-slate-100 text-slate-800 font-mono text-[11px]" {...rest}>
        {children}
      </code>
    );
  },
  pre({ children }) {
    return <pre className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-0">{children}</pre>;
  },
  table({ children }) {
    return (
      <div className="overflow-x-auto rounded-lg border border-slate-200 my-2">
        <table className="w-full text-[11px]">{children}</table>
      </div>
    );
  },
  thead({ children }) {
    return <thead className="bg-slate-50">{children}</thead>;
  },
  tbody({ children }) {
    return <tbody className="divide-y divide-slate-100">{children}</tbody>;
  },
  th({ children }) {
    return <th className="text-left px-2 py-1.5 font-bold text-slate-600 whitespace-nowrap">{children}</th>;
  },
  td({ children }) {
    return <td className="px-2 py-1.5 text-slate-700">{children}</td>;
  },
  h1({ children }) {
    return <h1 className="text-base font-black text-slate-900 mt-3 mb-1.5">{children}</h1>;
  },
  h2({ children }) {
    return <h2 className="text-sm font-black text-slate-900 mt-3 mb-1">{children}</h2>;
  },
  h3({ children }) {
    return <h3 className="text-xs font-extrabold text-slate-800 mt-2 mb-1">{children}</h3>;
  },
  ul({ children }) {
    return <ul className="list-disc pl-4 space-y-0.5 text-slate-700">{children}</ul>;
  },
  ol({ children }) {
    return <ol className="list-decimal pl-4 space-y-0.5 text-slate-700">{children}</ol>;
  },
  a({ children, href }) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="text-brand-orange hover:underline">
        {children}
      </a>
    );
  },
};

export const ArtifactMarkdown: React.FC<Props> = ({ text }) => {
  return (
    <div className="text-xs leading-relaxed text-slate-700 space-y-1.5">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {text}
      </ReactMarkdown>
    </div>
  );
};
