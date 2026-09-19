import React from 'react';

export function DataList({ items = [], className = '', columns = 1 }) {
  const colClass = columns === 2 ? 'sm:grid-cols-2' : columns === 3 ? 'sm:grid-cols-3' : 'grid-cols-1';

  return (
    <dl className={`grid gap-3 ${colClass} ${className}`}>
      {items.map((item, index) => (
        <div
          key={index}
          className="flex flex-col sm:flex-row sm:justify-between py-2 border-b border-slate-100 last:border-0 gap-1"
        >
          <dt className="text-xs text-slate-500 font-medium">{item.label}</dt>
          <dd className="text-xs sm:text-sm text-slate-900 font-semibold sm:text-right">
            {item.value ?? '-'}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default DataList;
