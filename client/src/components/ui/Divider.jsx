import React from 'react';

export function Divider({ children, className = '', orientation = 'horizontal' }) {
  if (orientation === 'vertical') {
    return (
      <div
        role="separator"
        aria-orientation="vertical"
        className={`inline-block w-px bg-slate-200 self-stretch ${className}`}
      />
    );
  }

  if (children) {
    return (
      <div
        role="separator"
        aria-orientation="horizontal"
        className={`flex items-center gap-3 my-4 text-xs text-slate-400 select-none ${className}`}
      >
        <div className="flex-1 h-px bg-slate-200" />
        <span className="shrink-0">{children}</span>
        <div className="flex-1 h-px bg-slate-200" />
      </div>
    );
  }

  return (
    <hr
      role="separator"
      className={`border-0 h-px bg-slate-200 my-4 ${className}`}
    />
  );
}

export default Divider;
