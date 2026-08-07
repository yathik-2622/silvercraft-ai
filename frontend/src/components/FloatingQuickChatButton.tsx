import React from "react";
import { motion } from "motion/react";
import { MessageSquarePlus } from "lucide-react";

interface Props {
  onClick: () => void;
}

// Bottom-right floating action button — the only entry point into Quick
// Chat from the dashboard (Phase 4). Matches the reference's
// floating-action-button convention: circular, brand-accented, a small
// scale-in on mount rather than just appearing.
export const FloatingQuickChatButton: React.FC<Props> = ({ onClick }) => (
  <motion.button
    type="button"
    onClick={onClick}
    initial={{ opacity: 0, scale: 0.7 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.15 }}
    whileHover={{ scale: 1.08 }}
    whileTap={{ scale: 0.95 }}
    title="Quick Chat — no project required"
    className="fixed bottom-6 right-6 z-40 flex items-center justify-center w-14 h-14 rounded-full bg-brand-orange text-white shadow-[0_8px_30px_rgba(230,114,37,0.4)] hover:bg-brand-orange-hover transition-colors cursor-pointer"
  >
    <MessageSquarePlus className="w-6 h-6" />
  </motion.button>
);
