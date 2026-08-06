import React from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Replaces window.confirm() (both real call sites: AdminPage.tsx's
 * delete-document flow and SidebarNavigator.tsx's delete-chat flow) — a
 * native browser dialog looks jarring against everything else in this app
 * and can't be styled at all. Same modal-card visual language as every
 * other modal in this app (rounded-2xl/3xl, soft shadow, brand-orange
 * primary action, rose for the destructive case).
 */
export const ConfirmModal: React.FC<Props> = ({ title, message, confirmLabel = "Confirm", destructive, onConfirm, onCancel }) => {
  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-2xs flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl border border-slate-200 shadow-2xl p-6">
        <div className="flex items-start gap-3">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              destructive ? "bg-rose-50 text-rose-600" : "bg-brand-orange-light text-brand-orange"
            }`}
          >
            <AlertTriangle className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-black text-slate-900">{title}</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">{message}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 rounded-xl text-xs font-bold text-white cursor-pointer ${
              destructive ? "bg-rose-600 hover:bg-rose-700" : "bg-brand-orange hover:bg-brand-orange-hover"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
