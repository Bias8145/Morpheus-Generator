import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X, Check, Trash2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
}

export default function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText,
  cancelText,
  type = 'danger'
}: ConfirmationModalProps) {
  const { t } = useLanguage();

  if (!isOpen) return null;

  const colors = {
    danger: {
      bg: 'bg-red-500',
      text: 'text-red-500',
      border: 'border-red-500/30',
      button: 'bg-red-600 hover:bg-red-500',
      icon: <Trash2 className="h-6 w-6 text-red-500" />
    },
    warning: {
      bg: 'bg-amber-500',
      text: 'text-amber-500',
      border: 'border-amber-500/30',
      button: 'bg-amber-600 hover:bg-amber-500',
      icon: <AlertTriangle className="h-6 w-6 text-amber-500" />
    },
    info: {
      bg: 'bg-blue-500',
      text: 'text-blue-500',
      border: 'border-blue-500/30',
      button: 'bg-blue-600 hover:bg-blue-500',
      icon: <AlertTriangle className="h-6 w-6 text-blue-500" />
    }
  };

  const theme = colors[type];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className={`relative w-full max-w-md bg-slate-900 border ${theme.border} rounded-[2rem] shadow-2xl overflow-hidden`}
        >
          {/* Header Decoration */}
          <div className={`h-1.5 w-full ${theme.bg}`} />

          <div className="p-8">
            <div className="flex items-start space-x-4">
              <div className={`p-3 rounded-2xl bg-slate-950 border ${theme.border} shrink-0`}>
                {theme.icon}
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  {message}
                </p>
              </div>
            </div>

            <div className="mt-8 flex items-center space-x-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors text-sm"
              >
                {cancelText || t('modal.cancel')}
              </button>
              <button
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                className={`flex-1 px-4 py-3 rounded-xl text-white font-bold transition-all shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] text-sm flex items-center justify-center space-x-2 ${theme.button}`}
              >
                <span>{confirmText || t('modal.confirm')}</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
