import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export interface ModernSelectOption<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: ModernSelectOption<T>[];
  className?: string;
  disabled?: boolean;
}

const DEFAULT_TRIGGER_CLASS =
  "w-full flex items-center justify-between px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 hover:border-slate-300 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed";

// Drop-in replacement for a native <select> — same value/onChange/options
// contract, but a floating popover list styled to match the rest of the
// app (the composer's model picker in ChatWorkspace uses the same
// trigger+popover shape) instead of the browser's own unstyled control.
export function ModernSelect<T extends string>({ value, onChange, options, className, disabled }: Props<T>) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={className ?? DEFAULT_TRIGGER_CLASS}
      >
        <span className="truncate">{current?.label ?? ""}</span>
        <ChevronDown className={`ml-1.5 w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && !disabled && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1.5 w-full max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg z-50">
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`w-full flex items-center justify-between gap-2 text-left px-3 py-2 text-[11px] font-semibold rounded-lg transition cursor-pointer ${
                  opt.value === value ? "bg-brand-orange-light text-brand-orange" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span className="truncate">{opt.label}</span>
                {opt.value === value && <Check className="w-3 h-3 shrink-0" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
