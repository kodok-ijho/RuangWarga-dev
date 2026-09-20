import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { AiOutlineCheckCircle, AiOutlineCloseCircle, AiOutlineInfoCircle, AiOutlineWarning } from 'react-icons/ai';

const ToastContext = createContext(null);

let toastIdCounter = 0;

const ICONS = {
  success: AiOutlineCheckCircle,
  error: AiOutlineCloseCircle,
  info: AiOutlineInfoCircle,
  warning: AiOutlineWarning,
};

const STYLES = {
  success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  error: 'bg-rose-50 border-rose-200 text-rose-800',
  info: 'bg-sky-50 border-sky-200 text-sky-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message, type = 'info', duration = 3500) => {
      const id = ++toastIdCounter;
      setToasts((prev) => [...prev, { id, message, type }]);
      if (duration > 0) {
        setTimeout(() => remove(id), duration);
      }
      return id;
    },
    [remove]
  );

  const api = useMemo(() => ({
    toast,
    success: (msg, duration) => toast(msg, 'success', duration),
    error: (msg, duration) => toast(msg, 'error', duration ?? 5000),
    info: (msg, duration) => toast(msg, 'info', duration),
    warning: (msg, duration) => toast(msg, 'warning', duration),
  }), [toast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => {
          const Icon = ICONS[t.type] || AiOutlineInfoCircle;
          return (
            <div
              key={t.id}
              className={`flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm shadow-elevated animate-[slideIn_0.2s_ease-out] ${STYLES[t.type] || STYLES.info}`}
              style={{ animationName: 'slideIn' }}
            >
              <Icon size={18} className="mt-0.5 shrink-0" />
              <p className="flex-1">{t.message}</p>
              <button
                onClick={() => remove(t.id)}
                className="shrink-0 opacity-60 hover:opacity-100 text-lg leading-none"
                aria-label="Tutup"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast harus dipakai di dalam <ToastProvider>');
  return ctx;
}
