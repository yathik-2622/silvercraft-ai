import { motion } from 'motion/react';

const actions = [
  'Continue with source analysis',
  'Show the modeling assumptions',
  'What information is still needed?',
  'Create a reviewable draft',
];

export const FollowUpActions = ({ onSelect }: { onSelect: (prompt: string) => void }) => (
  <div className="mt-4 flex flex-wrap gap-2">
    {actions.map((label) => (
      <motion.button key={label} whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }} onClick={() => onSelect(label)} className="rounded-full border border-[#e67225]/25 bg-white/70 px-3 py-1.5 text-[11px] font-semibold text-slate-600 shadow-sm transition hover:border-[#e67225]/60 hover:text-[#e67225]">
        {label}
      </motion.button>
    ))}
  </div>
);
