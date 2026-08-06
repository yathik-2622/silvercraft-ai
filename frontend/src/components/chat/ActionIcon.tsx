import React from "react";

interface Props {
  icon: React.ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
}

export const ActionIcon: React.FC<Props> = ({ icon, onClick, title, disabled }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:border-brand-orange hover:text-brand-orange disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
    >
      {icon}
    </button>
  );
};
