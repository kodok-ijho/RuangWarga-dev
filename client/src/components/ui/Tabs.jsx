import React from 'react';

export function Tabs({
  tabs = [],
  activeTab,
  onChange,
  className = '',
  size = 'md',
}) {
  const sizeClasses = {
    sm: 'text-xs py-1.5 px-3',
    md: 'text-sm py-2 px-4',
  };

  return (
    <div
      role="tablist"
      className={`inline-flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200/80 ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const Icon = tab.icon;

        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={`inline-flex items-center justify-center gap-1.5 font-medium rounded-lg transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30 ${
              sizeClasses[size] || sizeClasses.md
            } ${
              isActive
                ? 'bg-white text-slate-900 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            {Icon && <Icon className="text-base shrink-0" aria-hidden="true" />}
            <span>{tab.label}</span>
            {tab.badge !== undefined && tab.badge > 0 && (
              <span
                className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  isActive
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default Tabs;
