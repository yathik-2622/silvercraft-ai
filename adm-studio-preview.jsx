import React, { useState, useEffect, useRef } from "react";
import {
  Settings, Plus, Users, ChevronRight, ChevronDown, X, Check, RotateCcw,
  Edit3, Upload, Database, MessageSquare, Layers, Table2, GitBranch,
  Code2, Network, Sparkles, FolderKanban, Search, ArrowLeft, Send,
  FileText, Slash, Download, CircleDot, CheckCircle2, Circle, Lock,
  Paperclip, ChevronUp, Eye, EyeOff, Wand2, Share2, Building2
} from "lucide-react";

/* ───────────────────────── design tokens ─────────────────────────
Color:
  --ink        #17140F   primary text
  --ink-soft   #5B564C   secondary text
  --paper      #FFFFFF   base surface
  --sand       #FAF7F2   app background
  --line       #ECE6DA   hairline borders
  --ember      #FF4B12   primary orange (signature)
  --ember-deep #D93C0A   pressed / dark orange
  --ember-tint #FFE7DA   orange wash
  --ok         #1C8A5A   approved / success
  --wait       #C9820A   pending / attention
Type:
  Display: "Fragment Mono" (technical, data-catalog feel) for headings/labels
  Body:    "Inter" for prose
  Data:    "IBM Plex Mono" for schema/code/table content
Signature element: the "spine" — a vertical ledger rail on the workspace's
left edge rendering the 4 gates as a running manifest (stamped/unstamped),
echoing a data-lineage audit trail rather than a generic stepper.
------------------------------------------------------------------- */

function useGoogleFonts() {
  useEffect(() => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href =
      "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap";
    document.head.appendChild(l);
    return () => document.head.removeChild(l);
  }, []);
}

const C = {
  ink: "#17140F",
  inkSoft: "#5B564C",
  paper: "#FFFFFF",
  sand: "#FAF7F2",
  line: "#ECE6DA",
  ember: "#FF4B12",
  emberDeep: "#D93C0A",
  emberTint: "#FFE7DA",
  ok: "#1C8A5A",
  wait: "#C9820A",
};

const fDisplay = { fontFamily: "'Space Grotesk', sans-serif" };
const fBody = { fontFamily: "'Inter', sans-serif" };
const fMono = { fontFamily: "'IBM Plex Mono', monospace" };

/* ───────────────────────── mock data ───────────────────────── */

const MOCK_USER = { name: "Yathik R.", initials: "YR", role: "Senior AI Engineer" };

const MOCK_MEMBERS = [
  { name: "Yathik R.", initials: "YR", role: "owner" },
  { name: "Priya N.", initials: "PN", role: "editor" },
  { name: "Marcus D.", initials: "MD", role: "editor" },
  { name: "Wei C.", initials: "WC", role: "viewer" },
];

const MOCK_PROJECTS = {
  mine: [
    { id: 1, name: "Insurance Silver Model", domain: "Insurance", sub: "Claims & Policy", layer: "Foundation", updated: "2h ago", members: MOCK_MEMBERS.slice(0, 3) },
    { id: 2, name: "Underwriting Risk KPIs", domain: "Insurance", sub: "Risk & Underwriting", layer: "Product", updated: "1d ago", members: MOCK_MEMBERS.slice(0, 2) },
  ],
  shared: [
    { id: 3, name: "Claims Fraud Signals", domain: "Insurance", sub: "Fraud & Risk", layer: "Foundation", updated: "3d ago", members: MOCK_MEMBERS },
  ],
};

const GATES = [
  { key: "g1", label: "Source Analysis", steps: "1.1 – 1.7", desc: "Import · Profile · Dictionary · Classify · Domain · Keys · Relationships" },
  { key: "g2", label: "Conceptual Modeling", steps: "2.1 – 2.2", desc: "Generate Concepts · Conceptual Relationships" },
  { key: "g3", label: "Logical Modeling", steps: "3.1 – 3.10", desc: "Naming · Roles · Attributes · Keys · SCD · Enterprise Map · Relationships · M:N" },
  { key: "g4", label: "Physical Modeling", steps: "4.1 – 4.6", desc: "Surrogate Keys · Naming · Transform · STTM · DDL/DML · Artifacts" },
];

const ENTITIES = [
  { name: "AGENT", role: "DIMENSION", scd: "TYPE 2", pk: "agent_sk", x: 40, y: 40 },
  { name: "POLICY", role: "DIMENSION", scd: "TYPE 1", pk: "insurance_policy_num", x: 340, y: 40 },
  { name: "COVERAGE", role: "DIMENSION", scd: "TYPE 1", pk: "coverage_type_cd", x: 640, y: 40 },
  { name: "CLAIM", role: "FACT", scd: "N/A", pk: "claim_id", x: 190, y: 260 },
  { name: "BILLING", role: "FACT", scd: "N/A", pk: "billing_record_id", x: 490, y: 260 },
  { name: "PAYMENT", role: "FACT", scd: "N/A", pk: "payment_id", x: 490, y: 430 },
  { name: "UNDERWRITING", role: "DIMENSION", scd: "TYPE 1", pk: "underwriter_id", x: 40, y: 430 },
];

const REL_LINES = [
  [0, 3], [1, 3], [1, 4], [1, 5], [2, 3], [0, 1], [1, 6],
];

const ATTRS = [
  { entity: "CLAIM", col: "claim_id", type: "VARCHAR(255)", pk: true, fk: false, cls: "Internal" },
  { entity: "CLAIM", col: "insurance_policy_num", type: "VARCHAR(255)", pk: false, fk: true, cls: "Internal" },
  { entity: "CLAIM", col: "agent_sk", type: "INTEGER", pk: false, fk: true, cls: "Internal" },
  { entity: "CLAIM", col: "claim_paid_amt", type: "DECIMAL(18,2)", pk: false, fk: false, cls: "Confidential" },
  { entity: "CLAIM", col: "incurred_loss_amt", type: "DECIMAL(18,2)", pk: false, fk: false, cls: "Confidential" },
  { entity: "POLICY", col: "insurance_policy_num", type: "VARCHAR(255)", pk: true, fk: false, cls: "Internal" },
  { entity: "POLICY", col: "policyholder_email_addr", type: "VARCHAR(255)", pk: false, fk: false, cls: "PII" },
  { entity: "POLICY", col: "policy_gross_written_premium", type: "DECIMAL(18,2)", pk: false, fk: false, cls: "Confidential" },
];

const STTM_ROWS = [
  { src: "claims.Claim_Number", tgt: "claim.claim_id", type: "VARCHAR(255)", pk: "PK", expr: "src.Claim_Number" },
  { src: "claims.Agent_Code", tgt: "claim.agent_sk", type: "INTEGER", pk: "FK", expr: "agent.agent_sk" },
  { src: "claims.Paid_Amount", tgt: "claim.claim_paid_amt", type: "DECIMAL(18,2)", pk: "", expr: "CAST(Paid_Amount AS DECIMAL(18,2))" },
  { src: "policy.Email", tgt: "policy.policyholder_email_addr", type: "VARCHAR(255)", pk: "", expr: "LOWER(TRIM(Email))" },
];

const DDL_SAMPLE = `CREATE OR REPLACE TABLE silver.FCT_CLAIMS (
    CLAIM_ID                              VARCHAR(255) NOT NULL,
    INSURANCE_POLICY_NUM                  VARCHAR(255) NOT NULL,
    AGENT_SK                              INTEGER,
    COVERAGE_TYPE_CD                      VARCHAR(255),
    CLAIM_FILING_DT                       DATETIME,
    CLAIM_STAT                            VARCHAR(100),
    CLAIM_PAID_AMT                        DECIMAL(18,2),
    INCURRED_LOSS_AMT                     DECIMAL(18,2),
    PRIMARY KEY (CLAIM_ID),
    FOREIGN KEY (AGENT_SK) REFERENCES silver.DIM_AGENT(AGENT_SK),
    FOREIGN KEY (INSURANCE_POLICY_NUM) REFERENCES silver.DIM_POLICY(INSURANCE_POLICY_NUM)
);`;

const SKILLS = [
  { name: "kimball-dimensional", scope: "builtin", by: "Anthropic seed" },
  { name: "data-vault-2", scope: "builtin", by: "Anthropic seed" },
  { name: "pii-classification-heuristics", scope: "builtin", by: "Anthropic seed" },
  { name: "scd-temporal-best-practices", scope: "builtin", by: "Anthropic seed" },
  { name: "insurance-claims-naming-v2", scope: "project_shared", by: "Priya N." },
  { name: "agent-sk-override-rule", scope: "project_private", by: "Yathik R." },
];

/* ───────────────────────── small primitives ───────────────────────── */

function Badge({ children, tone = "neutral" }) {
  const tones = {
    neutral: { bg: "#F1EDE4", fg: C.inkSoft },
    ember: { bg: C.emberTint, fg: C.emberDeep },
    ok: { bg: "#E4F3EC", fg: C.ok },
    wait: { bg: "#FBEED4", fg: C.wait },
    dark: { bg: C.ink, fg: "#fff" },
  };
  const t = tones[tone];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium tracking-wide"
      style={{ background: t.bg, color: t.fg, ...fMono }}
    >
      {children}
    </span>
  );
}

function Avatar({ initials, size = 28 }) {
  return (
    <div
      className="rounded-full flex items-center justify-center font-semibold shrink-0"
      style={{
        width: size, height: size, fontSize: size * 0.36,
        background: C.ink, color: "#fff", ...fDisplay,
      }}
    >
      {initials}
    </div>
  );
}

function Button({ children, variant = "primary", onClick, small, disabled, icon: Icon }) {
  const base = "inline-flex items-center gap-1.5 rounded-lg font-medium transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed";
  const size = small ? "px-2.5 py-1.5 text-[12.5px]" : "px-4 py-2 text-sm";
  const styles = {
    primary: { background: C.ember, color: "#fff" },
    dark: { background: C.ink, color: "#fff" },
    ghost: { background: "transparent", color: C.ink, border: `1px solid ${C.line}` },
    subtle: { background: C.sand, color: C.ink },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${size}`}
      style={{ ...styles[variant], ...fBody }}
      onMouseEnter={(e) => { if (!disabled && variant === "primary") e.currentTarget.style.background = C.emberDeep; }}
      onMouseLeave={(e) => { if (!disabled && variant === "primary") e.currentTarget.style.background = C.ember; }}
    >
      {Icon && <Icon size={14} />}
      {children}
    </button>
  );
}

function Modal({ open, onClose, title, children, width = 560 }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(23,20,15,0.45)" }}>
      <div className="rounded-2xl shadow-2xl overflow-hidden" style={{ width, maxHeight: "86vh", background: C.paper }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${C.line}` }}>
          <h3 className="text-[16px] font-semibold" style={{ ...fDisplay, color: C.ink }}>{title}</h3>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-black/5">
            <X size={18} color={C.inkSoft} />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto" style={{ maxHeight: "72vh" }}>{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="mb-4">
      <label className="block text-[12px] font-medium mb-1.5 tracking-wide uppercase" style={{ ...fMono, color: C.inkSoft }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  border: `1px solid ${C.line}`, background: C.sand, fontSize: 14, outline: "none",
  ...fBody, color: C.ink,
};

/* ───────────────────────── Login ───────────────────────── */

function LoginScreen({ onLogin }) {
  return (
    <div className="min-h-screen w-full flex" style={{ background: C.paper }}>
      <div className="hidden lg:flex flex-col justify-between w-[46%] p-14 relative overflow-hidden" style={{ background: C.ink }}>
        <div className="absolute inset-0 opacity-[0.07]" style={{
          backgroundImage: `radial-gradient(${C.ember} 1px, transparent 1px)`, backgroundSize: "22px 22px"
        }} />
        <div className="relative z-10 flex items-center gap-2">
          <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ background: C.ember }}>
            <Layers size={16} color="#fff" />
          </div>
          <span className="text-white text-[15px] font-semibold tracking-tight" style={fDisplay}>ADM Agent Studio</span>
        </div>
        <div className="relative z-10">
          <div className="text-[13px] mb-3 tracking-widest uppercase" style={{ ...fMono, color: C.ember }}>Autonomous Data Modeling</div>
          <h1 className="text-white text-[40px] leading-[1.1] font-semibold mb-4" style={fDisplay}>
            From raw source<br />to physical model,<br />agent by agent.
          </h1>
          <p className="text-[14px] max-w-sm leading-relaxed" style={{ ...fBody, color: "#B8B3A6" }}>
            24 specialized agents. One orchestrator. Four gates you actually see.
          </p>
        </div>
        <div className="relative z-10 flex gap-6 text-[12px]" style={{ ...fMono, color: "#8A8478" }}>
          <span>MCP</span><span>A2A</span><span>LangGraph</span><span>Neo4j</span>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-[360px]">
          <div className="lg:hidden flex items-center gap-2 mb-10">
            <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ background: C.ember }}>
              <Layers size={16} color="#fff" />
            </div>
            <span className="text-[15px] font-semibold" style={fDisplay}>ADM Agent Studio</span>
          </div>
          <h2 className="text-[22px] font-semibold mb-1" style={{ ...fDisplay, color: C.ink }}>Welcome back</h2>
          <p className="text-[13.5px] mb-7" style={{ ...fBody, color: C.inkSoft }}>Sign in to continue to your projects.</p>
          <Field label="Email">
            <input style={inputStyle} placeholder="yathik@tigeranalytics.com" defaultValue="yathik@tigeranalytics.com" />
          </Field>
          <Field label="Password">
            <input style={inputStyle} type="password" placeholder="••••••••••" defaultValue="••••••••••" />
          </Field>
          <div className="mt-6">
            <Button onClick={onLogin} icon={ChevronRight}>Sign in</Button>
          </div>
          <div className="mt-5 text-[12.5px]" style={{ ...fBody, color: C.inkSoft }}>
            SSO available for enterprise workspaces.
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Settings Modal ───────────────────────── */

function SettingsModal({ open, onClose }) {
  const [provider, setProvider] = useState("Anthropic");
  return (
    <Modal open={open} onClose={onClose} title="Workspace settings" width={520}>
      <div className="text-[12px] tracking-widest uppercase mb-3" style={{ ...fMono, color: C.inkSoft }}>LLM Provider — bring your own key</div>
      <Field label="Provider">
        <select style={inputStyle} value={provider} onChange={(e) => setProvider(e.target.value)}>
          <option>Anthropic</option>
          <option>OpenAI</option>
          <option>Azure OpenAI</option>
          <option>Bedrock</option>
          <option>Self-hosted / OpenAI-compatible</option>
        </select>
      </Field>
      <Field label="API key">
        <input style={inputStyle} placeholder="sk-••••••••••••••••••••" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Model">
          <input style={inputStyle} defaultValue="claude-sonnet-5" />
        </Field>
        <Field label="Temperature">
          <input style={inputStyle} defaultValue="0.2" />
        </Field>
      </div>
      <label className="flex items-center gap-2 mt-1 mb-6 text-[13px]" style={{ ...fBody, color: C.ink }}>
        <input type="checkbox" defaultChecked /> Set as default provider
      </label>
      <div className="pt-4 flex justify-end gap-2" style={{ borderTop: `1px solid ${C.line}` }}>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={onClose} icon={Check}>Save settings</Button>
      </div>
    </Modal>
  );
}

/* ───────────────────────── Create Project Modal ───────────────────────── */

function CreateProjectModal({ open, onClose, onCreate }) {
  const [layer, setLayer] = useState("Foundation");
  const [team, setTeam] = useState(["Priya N.", "Marcus D."]);
  const toggle = (n) => setTeam((t) => (t.includes(n) ? t.filter((x) => x !== n) : [...t, n]));
  return (
    <Modal open={open} onClose={onClose} title="Create project" width={560}>
      <Field label="Project name">
        <input style={inputStyle} placeholder="e.g. Insurance Silver Model" defaultValue="Reinsurance Treaty Model" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Domain">
          <select style={inputStyle}><option>Insurance</option><option>Finance</option><option>Retail</option><option>Healthcare</option></select>
        </Field>
        <Field label="Subdomain">
          <input style={inputStyle} placeholder="e.g. Reinsurance" />
        </Field>
      </div>
      <Field label="Layer">
        <div className="flex gap-2">
          {["Foundation", "Product"].map((l) => (
            <button
              key={l}
              onClick={() => setLayer(l)}
              className="flex-1 rounded-lg px-3 py-2.5 text-[13.5px] font-medium text-left transition-colors"
              style={{
                border: `1.5px solid ${layer === l ? C.ember : C.line}`,
                background: layer === l ? C.emberTint : C.paper,
                color: layer === l ? C.emberDeep : C.ink, ...fBody,
              }}
            >
              <div className="font-semibold">{l} Layer</div>
              <div className="text-[11.5px] mt-0.5" style={{ color: C.inkSoft }}>
                {l === "Foundation" ? "4 stages · 25 steps · Silver" : "4 stages · 18 steps · Gold KPIs"}
              </div>
            </button>
          ))}
        </div>
      </Field>
      <Field label="Description">
        <textarea style={{ ...inputStyle, minHeight: 64, resize: "vertical" }} placeholder="Optional context for collaborators…" />
      </Field>
      <Field label="Team members">
        <div className="flex flex-wrap gap-2">
          {MOCK_MEMBERS.slice(1).map((m) => (
            <button
              key={m.name}
              onClick={() => toggle(m.name)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-full text-[12.5px] font-medium"
              style={{
                border: `1px solid ${team.includes(m.name) ? C.ember : C.line}`,
                background: team.includes(m.name) ? C.emberTint : C.paper,
                color: team.includes(m.name) ? C.emberDeep : C.inkSoft, ...fBody,
              }}
            >
              <Avatar initials={m.initials} size={18} /> {m.name}
            </button>
          ))}
        </div>
      </Field>
      <div className="pt-4 flex justify-end gap-2" style={{ borderTop: `1px solid ${C.line}` }}>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button icon={Plus} onClick={onCreate}>Create project</Button>
      </div>
    </Modal>
  );
}

/* ───────────────────────── Dashboard ───────────────────────── */

function ProjectCard({ p, onOpen }) {
  return (
    <button
      onClick={onOpen}
      className="text-left rounded-2xl p-5 transition-all hover:-translate-y-0.5"
      style={{ background: C.paper, border: `1px solid ${C.line}`, boxShadow: "0 1px 2px rgba(23,20,15,0.03)" }}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: C.emberTint }}>
          <FolderKanban size={16} color={C.emberDeep} />
        </div>
        <Badge tone={p.layer === "Foundation" ? "dark" : "ember"}>{p.layer}</Badge>
      </div>
      <div className="text-[15px] font-semibold mb-1" style={{ ...fDisplay, color: C.ink }}>{p.name}</div>
      <div className="text-[12.5px] mb-4" style={{ ...fBody, color: C.inkSoft }}>{p.domain} · {p.sub}</div>
      <div className="flex items-center justify-between">
        <div className="flex -space-x-2">
          {p.members.map((m) => <Avatar key={m.name} initials={m.initials} size={24} />)}
        </div>
        <span className="text-[11.5px]" style={{ ...fMono, color: C.inkSoft }}>{p.updated}</span>
      </div>
    </button>
  );
}

function Dashboard({ onOpenProject, onOpenSettings, onCreateProject }) {
  const [tab, setTab] = useState("mine");
  const list = tab === "mine" ? MOCK_PROJECTS.mine : MOCK_PROJECTS.shared;
  return (
    <div className="min-h-screen" style={{ background: C.sand }}>
      <header className="flex items-center justify-between px-8 py-4" style={{ borderBottom: `1px solid ${C.line}`, background: C.paper }}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: C.ember }}>
            <Layers size={14} color="#fff" />
          </div>
          <span className="text-[14.5px] font-semibold" style={fDisplay}>ADM Agent Studio</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={onOpenSettings} className="p-2 rounded-lg hover:bg-black/5">
            <Settings size={18} color={C.inkSoft} />
          </button>
          <Avatar initials={MOCK_USER.initials} />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-8 py-10">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h1 className="text-[26px] font-semibold" style={{ ...fDisplay, color: C.ink }}>Projects</h1>
            <p className="text-[13.5px] mt-1" style={{ ...fBody, color: C.inkSoft }}>Welcome back, {MOCK_USER.name.split(" ")[0]}.</p>
          </div>
          <Button icon={Plus} onClick={onCreateProject}>Create project</Button>
        </div>

        <div className="flex items-center gap-1 mb-6 p-1 rounded-lg w-fit" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
          {[["mine", "My projects"], ["shared", "Shared with me"]].map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className="px-3.5 py-1.5 rounded-md text-[13px] font-medium transition-colors"
              style={{ background: tab === k ? C.ink : "transparent", color: tab === k ? "#fff" : C.inkSoft, ...fBody }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.map((p) => <ProjectCard key={p.id} p={p} onOpen={() => onOpenProject(p)} />)}
        </div>
      </main>
    </div>
  );
}

/* ───────────────────────── Gate rail (signature element) ───────────────────────── */

function GateRail({ gates, activeIdx }) {
  return (
    <div className="w-[62px] shrink-0 flex flex-col items-center pt-6 pb-4" style={{ background: C.ink }}>
      {gates.map((g, i) => {
        const state = i < activeIdx ? "done" : i === activeIdx ? "current" : "locked";
        return (
          <div key={g.key} className="flex flex-col items-center">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center relative"
              style={{
                background: state === "done" ? C.ok : state === "current" ? C.ember : "transparent",
                border: state === "locked" ? `1.5px solid #3A362D` : "none",
              }}
              title={g.label}
            >
              {state === "done" && <CheckCircle2 size={16} color="#fff" />}
              {state === "current" && <CircleDot size={16} color="#fff" />}
              {state === "locked" && <Lock size={12} color="#5B564C" />}
            </div>
            <div className="mt-1.5 mb-1 text-center leading-tight" style={{ ...fMono, fontSize: 9, color: state === "locked" ? "#5B564C" : "#D9D4C7", width: 52 }}>
              {g.label.split(" ")[0]}
            </div>
            {i < gates.length - 1 && <div style={{ width: 1.5, height: 28, background: "#3A362D" }} />}
          </div>
        );
      })}
    </div>
  );
}

/* ───────────────────────── Canvas views ───────────────────────── */

function ERDView() {
  return (
    <div className="p-6 overflow-auto h-full" style={{ background: C.sand }}>
      <svg width="880" height="560" style={{ position: "absolute", pointerEvents: "none" }}>
        {REL_LINES.map(([a, b], i) => {
          const A = ENTITIES[a], B = ENTITIES[b];
          const x1 = A.x + 130, y1 = A.y + 40, x2 = B.x + 20, y2 = B.y + 40;
          return <line key={i} x1={x1 + 24} y1={y1} x2={x2 + 24} y2={y2} stroke={C.line} strokeWidth="1.5" />;
        })}
      </svg>
      <div className="relative" style={{ width: 880, height: 560 }}>
        {ENTITIES.map((e) => (
          <div key={e.name} className="absolute rounded-xl overflow-hidden shadow-sm" style={{ left: e.x, top: e.y, width: 168, border: `1px solid ${C.line}`, background: C.paper }}>
            <div className="px-3 py-2 flex items-center justify-between" style={{ background: e.role === "FACT" ? C.ink : C.emberTint }}>
              <span className="text-[11.5px] font-semibold tracking-tight" style={{ ...fMono, color: e.role === "FACT" ? "#fff" : C.emberDeep }}>{e.name}</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ ...fMono, background: e.role === "FACT" ? "#2E2A22" : "#fff", color: e.role === "FACT" ? "#D9D4C7" : C.emberDeep }}>{e.role[0]}</span>
            </div>
            <div className="px-3 py-2 text-[10.5px] space-y-1" style={fMono}>
              <div className="flex items-center gap-1" style={{ color: C.ink }}><Lock size={9} color={C.ember} /> {e.pk}</div>
              <div style={{ color: C.inkSoft }}>SCD {e.scd}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AttributesView() {
  return (
    <div className="h-full overflow-auto p-5" style={{ background: C.sand }}>
      <table className="w-full text-[12.5px] rounded-xl overflow-hidden" style={{ ...fMono, background: C.paper, border: `1px solid ${C.line}` }}>
        <thead>
          <tr style={{ background: C.sand }}>
            {["Entity", "Column", "Type", "PK", "FK", "Classification"].map((h) => (
              <th key={h} className="text-left px-3 py-2 font-semibold" style={{ color: C.inkSoft, borderBottom: `1px solid ${C.line}` }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ATTRS.map((a, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${C.line}` }}>
              <td className="px-3 py-2 font-semibold" style={{ color: C.ink }}>{a.entity}</td>
              <td className="px-3 py-2" style={{ color: C.ink }}>{a.col}</td>
              <td className="px-3 py-2" style={{ color: C.inkSoft }}>{a.type}</td>
              <td className="px-3 py-2">{a.pk && <Check size={13} color={C.ok} />}</td>
              <td className="px-3 py-2">{a.fk && <Check size={13} color={C.wait} />}</td>
              <td className="px-3 py-2">
                <Badge tone={a.cls === "PII" ? "ember" : a.cls === "Confidential" ? "wait" : "neutral"}>{a.cls}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function STTMView() {
  return (
    <div className="h-full overflow-auto p-5" style={{ background: C.sand }}>
      <table className="w-full text-[12px] rounded-xl overflow-hidden" style={{ ...fMono, background: C.paper, border: `1px solid ${C.line}` }}>
        <thead>
          <tr style={{ background: C.sand }}>
            {["Source", "Target", "Type", "Key", "Mapping Expression"].map((h) => (
              <th key={h} className="text-left px-3 py-2 font-semibold" style={{ color: C.inkSoft, borderBottom: `1px solid ${C.line}` }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {STTM_ROWS.map((r, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${C.line}` }}>
              <td className="px-3 py-2" style={{ color: C.inkSoft }}>{r.src}</td>
              <td className="px-3 py-2 font-semibold" style={{ color: C.ink }}>{r.tgt}</td>
              <td className="px-3 py-2" style={{ color: C.inkSoft }}>{r.type}</td>
              <td className="px-3 py-2">{r.pk && <Badge tone={r.pk === "PK" ? "ok" : "wait"}>{r.pk}</Badge>}</td>
              <td className="px-3 py-2" style={{ color: C.emberDeep }}>{r.expr}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DDLView() {
  return (
    <div className="h-full overflow-auto p-5" style={{ background: C.sand }}>
      <div className="flex items-center gap-2 mb-3">
        {["FCT_CLAIMS", "DIM_POLICY", "DIM_AGENT", "FCT_PAYMENTS"].map((t, i) => (
          <span key={t} className="px-2.5 py-1 rounded-md text-[11.5px] font-medium" style={{
            ...fMono, background: i === 0 ? C.ink : C.paper, color: i === 0 ? "#fff" : C.inkSoft, border: `1px solid ${C.line}`
          }}>{t}</span>
        ))}
      </div>
      <pre className="rounded-xl p-4 text-[12px] leading-relaxed overflow-auto" style={{ ...fMono, background: C.ink, color: "#E9E5D8" }}>
        {DDL_SAMPLE}
      </pre>
    </div>
  );
}

function KGView() {
  const nodes = [
    { label: "Session", x: 400, y: 30 }, { label: "Architecture", x: 560, y: 90 },
    { label: "SourceFeed", x: 240, y: 90 }, { label: "SourceTable", x: 240, y: 190 },
    { label: "ConceptualEntity", x: 400, y: 250 }, { label: "LogicalEntity", x: 400, y: 350 },
    { label: "PhysicalTable", x: 400, y: 450 },
  ];
  const edges = [[0, 1], [0, 2], [2, 3], [3, 4], [4, 5], [5, 6]];
  return (
    <div className="h-full overflow-auto p-6" style={{ background: C.sand }}>
      <div className="text-[12px] mb-4" style={{ ...fMono, color: C.inkSoft }}>Read-only · post push-to-KG · CLAIM lineage, 27-level ontology</div>
      <svg width="760" height="520">
        {edges.map(([a, b], i) => (
          <line key={i} x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y} stroke={C.line} strokeWidth="2" />
        ))}
        {nodes.map((n, i) => (
          <g key={i}>
            <circle cx={n.x} cy={n.y} r={i === nodes.length - 1 ? 26 : 20} fill={i === nodes.length - 1 ? C.ember : C.paper} stroke={i === nodes.length - 1 ? C.ember : C.line} strokeWidth="1.5" />
            <text x={n.x} y={n.y + 38} textAnchor="middle" style={{ ...fMono, fontSize: 10, fill: C.inkSoft }}>{n.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

const CANVAS_TABS = [
  { key: "erd", label: "ERD", icon: GitBranch, node: ERDView },
  { key: "attrs", label: "Attributes", icon: Table2, node: AttributesView },
  { key: "sttm", label: "STTM", icon: Layers, node: STTMView },
  { key: "ddl", label: "DDL / DML", icon: Code2, node: DDLView },
  { key: "kg", label: "KG Lineage", icon: Network, node: KGView },
];

/* ───────────────────────── Chat + gate card ───────────────────────── */

function IntakeWidget() {
  const [picked, setPicked] = useState(null);
  return (
    <div className="rounded-xl p-3.5 mt-2" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
      <div className="text-[12.5px] mb-2.5" style={{ ...fBody, color: C.inkSoft }}>How should I bring in the source?</div>
      <div className="flex gap-2">
        {[["file", "Upload files", Upload], ["db", "Connect a database", Database]].map(([k, label, Icon]) => (
          <button key={k} onClick={() => setPicked(k)} className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg text-[12.5px] font-medium"
            style={{
              border: `1.5px solid ${picked === k ? C.ember : C.line}`,
              background: picked === k ? C.emberTint : C.sand,
              color: picked === k ? C.emberDeep : C.ink, ...fBody,
            }}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function GateCard({ gate, status, onApprove, onEdit, onRegen, stats }) {
  return (
    <div className="rounded-xl overflow-hidden mt-2" style={{ border: `1px solid ${status === "done" ? "#CFE8DB" : C.line}`, background: C.paper }}>
      <div className="px-4 py-3 flex items-center justify-between" style={{ background: status === "done" ? "#F1FAF5" : C.sand }}>
        <div className="flex items-center gap-2">
          {status === "done" ? <CheckCircle2 size={15} color={C.ok} /> : <CircleDot size={15} color={C.ember} />}
          <span className="text-[13px] font-semibold" style={{ ...fDisplay, color: C.ink }}>{gate.label}</span>
          <Badge>{gate.steps}</Badge>
        </div>
        {status === "done" && <Badge tone="ok">Approved</Badge>}
      </div>
      <div className="px-4 py-3">
        <div className="text-[12px] mb-2.5" style={{ ...fBody, color: C.inkSoft }}>{gate.desc}</div>
        <div className="flex gap-4 mb-3">
          {stats.map((s) => (
            <div key={s.label}>
              <div className="text-[16px] font-semibold" style={{ ...fDisplay, color: C.ink }}>{s.value}</div>
              <div className="text-[10.5px] uppercase tracking-wide" style={{ ...fMono, color: C.inkSoft }}>{s.label}</div>
            </div>
          ))}
        </div>
        {status !== "done" && (
          <div className="flex gap-2">
            <Button small icon={Check} onClick={onApprove}>Approve</Button>
            <Button small variant="ghost" icon={Edit3} onClick={onEdit}>Edit in canvas</Button>
            <Button small variant="ghost" icon={RotateCcw} onClick={onRegen}>Regenerate</Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ChatBubble({ role, children }) {
  if (role === "user") {
    return (
      <div className="flex justify-end mb-4">
        <div className="rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[80%] text-[13.5px]" style={{ background: C.ink, color: "#fff", ...fBody }}>
          {children}
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-2.5 mb-4">
      <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5" style={{ background: C.ember }}>
        <Sparkles size={12} color="#fff" />
      </div>
      <div className="max-w-[86%]">
        <div className="text-[13px] leading-relaxed" style={{ ...fBody, color: C.ink }}>{children}</div>
      </div>
    </div>
  );
}

const SLASH_CMDS = [
  { cmd: "/skill list", desc: "Browse builtin, shared & private skills" },
  { cmd: "/skill create", desc: "Parse a file into a new skill" },
  { cmd: "/skill enhance", desc: "AI-assist edit an existing skill" },
  { cmd: "/connect db", desc: "Open database connection form" },
  { cmd: "/upload", desc: "Attach source files" },
  { cmd: "/download", desc: "Download a generated artifact" },
  { cmd: "/workflow custom", desc: "Build a custom agent DAG" },
];

function ChatPane({ gateIdx, gateStatus, onApprove, onEdit, onRegen, onOpenSkills }) {
  const [msg, setMsg] = useState("");
  const [showSlash, setShowSlash] = useState(false);
  const scrollRef = useRef(null);

  const gateStats = [
    [{ label: "Tables", value: 8 }, { label: "Columns", value: 71 }, { label: "PII flags", value: 12 }],
    [{ label: "Concepts", value: 8 }, { label: "Relationships", value: 8 }],
    [{ label: "Entities", value: 8 }, { label: "SCD Type 2", value: 1 }, { label: "Rel.", value: 8 }],
    [{ label: "Tables", value: 8 }, { label: "Surrogate keys", value: 1 }, { label: "Artifacts", value: 24 }],
  ];

  return (
    <div className="flex flex-col h-full" style={{ background: C.paper }}>
      <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
        <div className="flex items-center gap-2">
          <MessageSquare size={15} color={C.inkSoft} />
          <span className="text-[13px] font-semibold" style={fDisplay}>Master Orchestrator</span>
        </div>
        <button onClick={onOpenSkills} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium" style={{ ...fBody, background: C.sand, color: C.inkSoft }}>
          <Wand2 size={13} /> Skills
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4">
        <ChatBubble role="assistant">
          Hi Yathik — I'm ready when you are. Attach your source files or connect a database and I'll take it from Source Analysis through Physical Modeling.
        </ChatBubble>
        <ChatBubble role="user">Insurance claims dataset — 8 tables, want dimensional modeling, Snowflake target.</ChatBubble>
        <ChatBubble role="assistant">Got it — dimensional modeling, Snowflake DDL.<IntakeWidget /></ChatBubble>
        <ChatBubble role="user">Files, uploading now.</ChatBubble>
        <ChatBubble role="assistant">
          8 files received and parsed. Running Source Analysis — profiling, dictionary enrichment, classification, domain assignment, key detection, relationship discovery.
          <GateCard gate={GATES[0]} status={gateIdx > 0 ? "done" : "current"} stats={gateStats[0]}
            onApprove={() => onApprove(0)} onEdit={() => onEdit("attrs")} onRegen={() => onRegen(0)} />
        </ChatBubble>
        {gateIdx >= 1 && (
          <ChatBubble role="assistant">
            Source Analysis approved. Moving to Conceptual Modeling — deriving business concepts and their relationships.
            <GateCard gate={GATES[1]} status={gateIdx > 1 ? "done" : "current"} stats={gateStats[1]}
              onApprove={() => onApprove(1)} onEdit={() => onEdit("erd")} onRegen={() => onRegen(1)} />
          </ChatBubble>
        )}
        {gateIdx >= 2 && (
          <ChatBubble role="assistant">
            Conceptual model locked. Logical Modeling in progress — naming, FACT/DIMENSION roles, attribute mapping, keys, SCD review, enterprise-model mapping, relationships, M:N resolution.
            <GateCard gate={GATES[2]} status={gateIdx > 2 ? "done" : "current"} stats={gateStats[2]}
              onApprove={() => onApprove(2)} onEdit={() => onEdit("attrs")} onRegen={() => onRegen(2)} />
          </ChatBubble>
        )}
        {gateIdx >= 3 && (
          <ChatBubble role="assistant">
            Logical model locked. Physical Modeling — surrogate keys, naming, transformations, STTM, DDL/DML, artifacts.
            <GateCard gate={GATES[3]} status={gateIdx > 3 ? "done" : "current"} stats={gateStats[3]}
              onApprove={() => onApprove(3)} onEdit={() => onEdit("ddl")} onRegen={() => onRegen(3)} />
          </ChatBubble>
        )}
        {gateIdx >= 4 && (
          <ChatBubble role="assistant">
            All four gates approved. Physical model is ready — push to metastore, push to KG, or download artifacts from the top bar whenever you're set.
          </ChatBubble>
        )}
      </div>

      <div className="px-5 py-3.5 relative" style={{ borderTop: `1px solid ${C.line}` }}>
        {showSlash && (
          <div className="absolute bottom-full left-5 right-5 mb-2 rounded-xl overflow-hidden shadow-lg" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
            {SLASH_CMDS.map((s) => (
              <button key={s.cmd} className="w-full flex items-center justify-between px-3.5 py-2 hover:bg-black/[0.03] text-left"
                onClick={() => { setMsg(s.cmd + " "); setShowSlash(false); }}>
                <span className="text-[12.5px] font-medium" style={{ ...fMono, color: C.emberDeep }}>{s.cmd}</span>
                <span className="text-[11.5px]" style={{ ...fBody, color: C.inkSoft }}>{s.desc}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: C.sand, border: `1px solid ${C.line}` }}>
          <button className="p-1 rounded hover:bg-black/5"><Paperclip size={15} color={C.inkSoft} /></button>
          <input
            value={msg}
            onChange={(e) => { setMsg(e.target.value); setShowSlash(e.target.value === "/"); }}
            placeholder="Message the orchestrator, or type / for commands…"
            className="flex-1 bg-transparent outline-none text-[13px]"
            style={{ ...fBody, color: C.ink }}
          />
          <button className="p-1.5 rounded-lg" style={{ background: C.ember }}><Send size={13} color="#fff" /></button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Skills drawer ───────────────────────── */

function SkillsDrawer({ open, onClose }) {
  const [creating, setCreating] = useState(false);
  const grouped = {
    builtin: SKILLS.filter((s) => s.scope === "builtin"),
    project_shared: SKILLS.filter((s) => s.scope === "project_shared"),
    project_private: SKILLS.filter((s) => s.scope === "project_private"),
  };
  const scopeLabel = { builtin: "Builtin", project_shared: "Shared in project", project_private: "Private to you" };
  const scopeTone = { builtin: "neutral", project_shared: "ok", project_private: "ember" };
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end" style={{ background: "rgba(23,20,15,0.35)" }} onClick={onClose}>
      <div className="w-[400px] h-full overflow-y-auto" style={{ background: C.paper }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${C.line}` }}>
          <span className="text-[15px] font-semibold" style={fDisplay}>Skills</span>
          <button onClick={onClose}><X size={18} color={C.inkSoft} /></button>
        </div>
        <div className="p-5">
          <Button icon={Plus} onClick={() => setCreating(true)}>Create skill</Button>

          {creating && (
            <div className="mt-4 rounded-xl p-4" style={{ background: C.sand, border: `1px solid ${C.line}` }}>
              <div className="text-[12px] font-medium mb-2" style={{ ...fMono, color: C.inkSoft }}>NEW SKILL</div>
              <div className="rounded-lg px-3 py-6 flex flex-col items-center gap-2 mb-3" style={{ border: `1.5px dashed ${C.line}`, background: C.paper }}>
                <Upload size={18} color={C.inkSoft} />
                <span className="text-[12px]" style={{ ...fBody, color: C.inkSoft }}>Drop a skill file, or describe it below</span>
              </div>
              <textarea style={{ ...inputStyle, minHeight: 60 }} placeholder="e.g. Always suffix junction tables with _BRIDGE and require a surrogate key…" />
              <div className="flex items-center justify-between mt-3">
                <label className="flex items-center gap-1.5 text-[12px]" style={{ ...fBody, color: C.ink }}>
                  <input type="checkbox" defaultChecked /> <Wand2 size={12} color={C.ember} /> Enhance with AI
                </label>
                <div className="flex gap-2">
                  <Button small variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
                  <Button small onClick={() => setCreating(false)}>Save skill</Button>
                </div>
              </div>
            </div>
          )}

          {Object.entries(grouped).map(([scope, items]) => (
            <div key={scope} className="mt-6">
              <div className="text-[11px] uppercase tracking-widest mb-2" style={{ ...fMono, color: C.inkSoft }}>{scopeLabel[scope]}</div>
              <div className="space-y-2">
                {items.map((s) => (
                  <div key={s.name} className="flex items-center justify-between rounded-lg px-3 py-2.5" style={{ border: `1px solid ${C.line}` }}>
                    <div>
                      <div className="text-[12.5px] font-medium" style={{ ...fMono, color: C.ink }}>{s.name}</div>
                      <div className="text-[11px] mt-0.5" style={{ ...fBody, color: C.inkSoft }}>{s.by}</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge tone={scopeTone[scope]}>{scope === "builtin" ? "core" : scope === "project_shared" ? "shared" : "private"}</Badge>
                      <button className="p-1 rounded hover:bg-black/5"><Download size={13} color={C.inkSoft} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Workspace ───────────────────────── */

function Workspace({ project, onBack }) {
  const [gateIdx, setGateIdx] = useState(0); // number of gates approved
  const [canvasTab, setCanvasTab] = useState("erd");
  const [skillsOpen, setSkillsOpen] = useState(false);

  const approve = (i) => setGateIdx((g) => Math.max(g, i + 1));
  const openEdit = (tab) => setCanvasTab(tab);
  const regen = () => {};

  const allDone = gateIdx >= 4;

  return (
    <div className="h-screen flex" style={{ background: C.sand }}>
      <GateRail gates={GATES} activeIdx={gateIdx} />

      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: `1px solid ${C.line}`, background: C.paper }}>
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-black/5 shrink-0"><ArrowLeft size={16} color={C.inkSoft} /></button>
            <div className="min-w-0">
              <div className="text-[14px] font-semibold truncate" style={{ ...fDisplay, color: C.ink }}>{project.name}</div>
              <div className="text-[11px]" style={{ ...fMono, color: C.inkSoft }}>{project.domain} · {project.layer} Layer · session #a19f-2b</div>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex -space-x-2">
              {project.members.map((m) => <Avatar key={m.name} initials={m.initials} size={26} />)}
            </div>
            <Button small variant="ghost" icon={Share2}>Invite</Button>
            <Button small variant="dark" disabled={!allDone} icon={Database}>Push to metastore</Button>
            <Button small disabled={!allDone} icon={Network}>Push to KG</Button>
          </div>
        </div>

        <div className="flex-1 flex min-h-0">
          <div className="w-[420px] shrink-0 min-h-0" style={{ borderRight: `1px solid ${C.line}` }}>
            <ChatPane gateIdx={gateIdx} onApprove={approve} onEdit={openEdit} onRegen={regen} onOpenSkills={() => setSkillsOpen(true)} />
          </div>

          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex items-center gap-1 px-4 pt-3" style={{ background: C.paper, borderBottom: `1px solid ${C.line}` }}>
              {CANVAS_TABS.map((t) => (
                <button key={t.key} onClick={() => setCanvasTab(t.key)}
                  className="flex items-center gap-1.5 px-3 py-2 text-[12.5px] font-medium rounded-t-lg -mb-px"
                  style={{
                    ...fBody,
                    color: canvasTab === t.key ? C.emberDeep : C.inkSoft,
                    borderBottom: canvasTab === t.key ? `2px solid ${C.ember}` : "2px solid transparent",
                  }}>
                  <t.icon size={13} /> {t.label}
                </button>
              ))}
              <div className="ml-auto flex items-center gap-2 pb-2">
                <button className="flex items-center gap-1 px-2 py-1 rounded-md text-[11.5px]" style={{ ...fBody, color: C.inkSoft, background: C.sand }}>
                  <Edit3 size={12} /> Edit
                </button>
                <Button small variant="subtle" icon={Download}>Save</Button>
              </div>
            </div>
            <div className="flex-1 min-h-0">
              {CANVAS_TABS.find((t) => t.key === canvasTab).node()}
            </div>
          </div>
        </div>
      </div>

      <SkillsDrawer open={skillsOpen} onClose={() => setSkillsOpen(false)} />
    </div>
  );
}

/* ───────────────────────── Root ───────────────────────── */

export default function App() {
  useGoogleFonts();
  const [screen, setScreen] = useState("login");
  const [project, setProject] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div style={{ ...fBody }}>
      {screen === "login" && <LoginScreen onLogin={() => setScreen("dashboard")} />}

      {screen === "dashboard" && (
        <>
          <Dashboard
            onOpenProject={(p) => { setProject(p); setScreen("workspace"); }}
            onOpenSettings={() => setSettingsOpen(true)}
            onCreateProject={() => setCreateOpen(true)}
          />
          <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
          <CreateProjectModal open={createOpen} onClose={() => setCreateOpen(false)} onCreate={() => setCreateOpen(false)} />
        </>
      )}

      {screen === "workspace" && project && (
        <Workspace project={project} onBack={() => setScreen("dashboard")} />
      )}
    </div>
  );
}
