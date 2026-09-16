import { IS_DEMO_MODE } from '../hooks/useAuth';
import pkg from '../../package.json';

const APP_VERSION = `v${pkg.version || '1.0.1'}`;

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-forest-200 bg-forest-800">
      <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="Logo" className="h-8 w-auto rounded object-cover ring-1 ring-gold-500/30" />
          <span className="text-sm text-forest-300 font-display">
            Palm Village
          </span>
          <span className="inline-flex items-center rounded bg-gold-500/20 text-gold-300 px-2 py-0.5 text-xs font-mono font-bold border border-gold-400/30">
            {APP_VERSION}
          </span>
          {IS_DEMO_MODE && (
            <span className="inline-flex items-center rounded bg-amber-400/20 text-amber-300 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-amber-400/30">
              Demo
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-forest-400">
          <span>&copy; {new Date().getFullYear()} Palm Village. All rights reserved.</span>
          <span className="font-mono text-gold-400/80">{APP_VERSION}</span>
        </div>
      </div>
    </footer>
  );
}
