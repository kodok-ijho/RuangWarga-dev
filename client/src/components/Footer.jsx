import BrandLogo from './BrandLogo';
import { IS_DEMO_MODE } from '../hooks/useAuth';
import pkg from '../../package.json';

const APP_VERSION = `v${pkg.version || '1.0.1'}`;

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-slate-200 bg-white">
      <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BrandLogo size="sm" showWordmark={true} />
          <span className="inline-flex items-center rounded bg-slate-100 text-slate-700 px-2 py-0.5 text-xs font-mono font-bold border border-slate-200">
            {APP_VERSION}
          </span>
          {IS_DEMO_MODE && (
            <span className="inline-flex items-center rounded bg-amber-50 text-amber-800 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide border border-amber-300">
              Demo
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span>&copy; {new Date().getFullYear()} RuangWarga. All rights reserved.</span>
          <span className="font-mono text-slate-400">{APP_VERSION}</span>
        </div>
      </div>
    </footer>
  );
}
