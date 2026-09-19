import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AiOutlineClose } from 'react-icons/ai';

export function BottomSheet({
  isOpen,
  onClose,
  title,
  children,
  className = '',
}) {
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'bottom-sheet-title' : undefined}
        className={`relative w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-rw-modal p-4 sm:p-6 max-h-[85vh] overflow-y-auto z-10 animate-in slide-in-from-bottom-5 duration-200 ${className}`}
      >
        {/* Handle for mobile */}
        <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-4 sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
          {title && (
            <h3 id="bottom-sheet-title" className="text-base font-bold text-slate-900">
              {title}
            </h3>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors ml-auto"
            aria-label="Tutup"
          >
            <AiOutlineClose className="text-base" />
          </button>
        </div>

        {/* Content */}
        <div className="text-sm text-slate-700">{children}</div>
      </div>
    </div>,
    document.body
  );
}

export default BottomSheet;
