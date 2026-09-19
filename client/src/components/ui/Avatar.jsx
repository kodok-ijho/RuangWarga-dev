import React, { useState } from 'react';

const SIZES = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-lg',
};

export function Avatar({
  src,
  alt = 'Avatar',
  name = '',
  size = 'md',
  className = '',
}) {
  const [hasError, setHasError] = useState(false);
  const sizeClass = SIZES[size] || SIZES.md;

  const getInitials = (str) => {
    if (!str) return '?';
    const parts = str.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return str.slice(0, 2).toUpperCase();
  };

  return (
    <div
      className={`relative inline-flex items-center justify-center rounded-full bg-slate-100 text-slate-700 font-semibold border border-slate-200 overflow-hidden shrink-0 select-none ${sizeClass} ${className}`}
      title={name || alt}
    >
      {src && !hasError ? (
        <img
          src={src}
          alt={alt || name}
          onError={() => setHasError(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <span>{getInitials(name || alt)}</span>
      )}
    </div>
  );
}

export default Avatar;
