import React from 'react';

const VARIANTS = {
  emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
  amber: 'bg-amber-50 text-amber-800 border-amber-200/80',
  rose: 'bg-rose-50 text-rose-800 border-rose-200/80',
  sky: 'bg-sky-50 text-sky-800 border-sky-200/80',
  purple: 'bg-purple-50 text-purple-800 border-purple-200/80',
  forest: 'bg-forest-50 text-forest-800 border-forest-200/80',
  slate: 'bg-slate-100 text-slate-700 border-slate-200',
  gold: 'bg-gold-50 text-gold-900 border-gold-300',
};

const SIZES = {
  sm: 'px-2 py-0.5 text-[10px]',
  md: 'px-2.5 py-0.5 text-xs',
  lg: 'px-3 py-1 text-xs',
};

export function Badge({
  children,
  variant = 'slate',
  size = 'md',
  icon: Icon,
  className = '',
  ...props
}) {
  const variantClass = VARIANTS[variant] || VARIANTS.slate;
  const sizeClass = SIZES[size] || SIZES.md;

  return (
    <span
      className={`inline-flex items-center gap-1 font-semibold rounded-full border tracking-wide uppercase ${variantClass} ${sizeClass} ${className}`}
      {...props}
    >
      {Icon && <Icon className="shrink-0 text-current text-[11px]" aria-hidden="true" />}
      <span>{children}</span>
    </span>
  );
}

export default Badge;
