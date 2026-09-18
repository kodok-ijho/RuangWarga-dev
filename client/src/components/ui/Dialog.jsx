import React, { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { AiOutlineClose } from 'react-icons/ai';

const MAX_WIDTHS = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
};

export function Dialog({
  isOpen,
  open,
  onClose,
  title,
  description,
  children,
  maxWidth = 'md',
  preventCloseOnBackdrop = false,
  showCloseButton = true,
  className = '',
}) {
  const visible = open !== undefined ? open : isOpen;

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape' && !preventCloseOnBackdrop) {
        onClose();
      }
    },
    [onClose, preventCloseOnBackdrop]
  );

  useEffect(() => {
    if (!visible || typeof document === 'undefined') return;

    // Kunci scroll body saat modal aktif
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalStyle;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [visible, handleKeyDown]);

  if (!visible) return null;

  const maxWidthClass = MAX_WIDTHS[maxWidth] || MAX_WIDTHS.md;

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-xs sm:items-center sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'dialog-title' : undefined}
      aria-describedby={description ? 'dialog-description' : undefined}
    >
      {/* Backdrop click area */}
      <div
        className="fixed inset-0"
        aria-hidden="true"
        onClick={() => !preventCloseOnBackdrop && onClose()}
      />

      {/* Modal Card Panel */}
      <div
        className={`relative w-full ${maxWidthClass} bg-white rounded-t-2xl sm:rounded-2xl border border-slate-200/90 shadow-elevated z-10 max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col overflow-hidden transition-all ${className}`}
      >
        {/* Header */}
        {(title || showCloseButton) && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
            <div>
              {title && (
                <h3 id="dialog-title" className="text-base font-bold text-slate-900 font-display">
                  {title}
                </h3>
              )}
              {description && (
                <p id="dialog-description" className="text-xs text-slate-500 mt-0.5">
                  {description}
                </p>
              )}
            </div>

            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition pv-focus-ring ml-2 shrink-0"
                aria-label="Tutup dialog"
              >
                <AiOutlineClose className="text-lg" aria-hidden="true" />
              </button>
            )}
          </div>
        )}

        {/* Content Body */}
        <div className="p-5 overflow-y-auto overscroll-contain flex-1 space-y-4 text-sm text-slate-700">
          {children}
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined' || !document.body) {
    return modalContent;
  }

  return createPortal(modalContent, document.body);
}

export default Dialog;
