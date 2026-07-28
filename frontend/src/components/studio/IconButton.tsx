import React from 'react';
import { motion } from 'motion/react';

export const IconButton = ({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) => (
  <motion.button
    type="button"
    aria-label={label}
    title={label}
    onClick={onClick}
    whileHover={{ scale: 1.06 }}
    whileTap={{ scale: 0.92 }}
    className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 bg-slate-50 text-slate-500 transition hover:border-[#e67225]/50 hover:bg-[#e67225]/10 hover:text-[#e67225]"
  >
    {children}
  </motion.button>
);
