import React from 'react';

const SIZE_MAP = {
  sm: {
    icon: 'h-6 w-6',
    text: 'text-sm',
    gap: 'gap-1.5',
  },
  md: {
    icon: 'h-8 w-8',
    text: 'text-base sm:text-lg',
    gap: 'gap-2',
  },
  lg: {
    icon: 'h-12 w-12',
    text: 'text-2xl sm:text-3xl',
    gap: 'gap-2.5',
  },
};

export default function BrandLogo({
  variant = 'light',
  size = 'md',
  showWordmark = true,
  className = '',
}) {
  const isDark = variant === 'dark';
  const sizeConfig = SIZE_MAP[size] || SIZE_MAP.md;
  const iconSrc = isDark ? '/brand/rw-mark-on-dark.svg' : '/brand/rw-mark.svg';

  return (
    <div
      className={`inline-flex items-center ${sizeConfig.gap} ${className}`.trim()}
      role="img"
      aria-label="RuangWarga"
    >
      <img
        src={iconSrc}
        alt="RuangWarga"
        className={`${sizeConfig.icon} shrink-0 object-contain`}
      />
      {showWordmark && (
        <span className={`font-sans font-bold tracking-tight select-none leading-none ${sizeConfig.text}`}>
          <span className={isDark ? 'text-white' : 'text-forest-800'}>Ruang</span>
          <span className="text-gold-500">Warga</span>
        </span>
      )}
    </div>
  );
}
