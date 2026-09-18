import React, { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { AiOutlineClose } from 'react-icons/ai';

export function Drawer({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  width = 'max-w-md',
  className = '',
}) {
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!isOpen) return;

    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalStyle;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const drawerContent = (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs transition-opacity"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'drawer-title' : undefined}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div
        className={`relative w-full ${width} bg-white h-full shadow-2xl border-l border-slate-200 z-10 flex flex-col overflow-hidden transition-transform duration-300 ease-out ${className}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            {title && (
              <h3 id="drawer-title" className="text-base font-bold text-slate-900 font-display">
                {title}
              </h3>
            )}
            {description && (
              <p className="text-xs text-slate-500 mt-0.5">{description}</p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition pv-focus-ring ml-3 shrink-0"
            aria-label="Tutup panel"
          >
            <AiOutlineClose className="text-base" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-sm text-slate-700 overscroll-contain">
          {children}
        </div>

        {/* Optional Footer */}
        {footer && (
          <div className="p-4 border-t border-slate-100 bg-slate-50/80 shrink-0 flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document === 'undefined' || !document.body) {
    return drawerContent;
  }

  return createPortal(drawerContent, document.body);
}

export default Drawer;
