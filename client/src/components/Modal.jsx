import { useEffect } from 'react';

/**
 * Modal reusable dengan backdrop, close button, dan ESC key support.
 *
 * @param {boolean} open - apakah modal tampil
 * @param {function} onClose - handler ketika modal ditutup
 * @param {string} title - judul modal (opsional)
 * @param {ReactNode} children - isi modal
 * @param {string} size - 'sm' | 'md' | 'lg' | 'xl'
 */
export default function Modal({ open, onClose, title, children, size = 'md' }) {
  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };

  // ESC key untuk tutup
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Lock scroll body saat modal terbuka
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />

      {/* Modal content */}
      <div
        className={`relative pv-card w-full ${sizes[size]} max-h-[90vh] overflow-y-auto shadow-elevated bg-white`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white/95 backdrop-blur-xs z-10">
            <h3 className="font-bold text-slate-900 text-base">{title}</h3>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 text-xl leading-none"
              aria-label="Tutup"
            >
              ✕
            </button>
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
