import React from 'react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';

interface TerminalCardProps {
  children: React.ReactNode;
  className?: string;
  title?: React.ReactNode;
  action?: React.ReactNode;
  variant?: 'default' | 'danger' | 'success' | 'warning' | 'info';
}

export default function TerminalCard({ children, className, title, action, variant = 'default' }: TerminalCardProps) {
  const variants = {
    default: 'border-slate-800 bg-slate-900/50 hover:border-emerald-500/30',
    danger: 'border-red-900/50 bg-red-950/10 hover:border-red-500/50',
    success: 'border-emerald-900/50 bg-emerald-950/10 hover:border-emerald-400/50',
    warning: 'border-amber-900/50 bg-amber-950/10 hover:border-amber-400/50',
    info: 'border-blue-900/50 bg-blue-950/10 hover:border-blue-400/50',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={clsx(
        "relative rounded-[2rem] border backdrop-blur-md transition-all duration-300 overflow-hidden group shadow-xl",
        variants[variant],
        className
      )}
    >
      {/* Header */}
      {(title || action) && (
        <div className="flex items-center justify-between px-6 py-4 md:px-8 md:py-5 border-b border-white/5 bg-white/5">
          <div className="font-mono font-bold text-xs tracking-widest uppercase flex items-center">
            {variant === 'default' && <span className="w-2 h-2 rounded-full bg-emerald-500 mr-3 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />}
            {variant === 'danger' && <span className="w-2 h-2 rounded-full bg-red-500 mr-3 shadow-[0_0_8px_rgba(239,68,68,0.5)] animate-pulse" />}
            {variant === 'success' && <span className="w-2 h-2 rounded-full bg-emerald-400 mr-3 shadow-[0_0_8px_rgba(52,211,153,0.5)]" />}
            {variant === 'warning' && <span className="w-2 h-2 rounded-full bg-amber-500 mr-3 shadow-[0_0_8px_rgba(245,158,11,0.5)]" />}
            {variant === 'info' && <span className="w-2 h-2 rounded-full bg-blue-500 mr-3 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />}
            {title}
          </div>
          <div className="flex items-center space-x-2">
            {action}
          </div>
        </div>
      )}
      
      {/* Responsive Padding: Smaller on mobile, spacious on desktop */}
      <div className="p-5 md:p-8">
        {children}
      </div>
    </motion.div>
  );
}
