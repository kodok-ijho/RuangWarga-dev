import React, { forwardRef } from 'react';

const PADDINGS = {
  none: '',
  sm: 'p-3 sm:p-4',
  md: 'p-4 sm:p-6',
  lg: 'p-6 sm:p-8',
};

export const Card = forwardRef(function Card(
  {
    children,
    padding = 'md',
    hoverable = false,
    className = '',
    onClick,
    ...props
  },
  ref
) {
  const paddingClass = PADDINGS[padding] || PADDINGS.md;

  return (
    <div
      ref={ref}
      onClick={onClick}
      className={`rounded-2xl bg-white border border-slate-200/90 shadow-card transition-all ${
        hoverable ? 'hover:border-slate-300 hover:shadow-subtle cursor-pointer' : ''
      } ${paddingClass} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
});

export default Card;
