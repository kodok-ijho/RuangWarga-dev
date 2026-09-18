import React from 'react';

export function Section({
  title,
  subtitle,
  icon: Icon,
  actions,
  children,
  className = '',
  headerClassName = '',
  ...props
}) {
  return (
    <section className={`space-y-4 ${className}`} {...props}>
      {(title || actions) && (
        <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${headerClassName}`}>
          <div className="space-y-0.5">
            {title && (
              <div className="flex items-center gap-2">
                {Icon && <Icon className="text-lg text-forest-800 shrink-0" aria-hidden="true" />}
                <h3 className="text-title-section">{title}</h3>
              </div>
            )}
            {subtitle && <p className="text-meta">{subtitle}</p>}
          </div>

          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}

      {children}
    </section>
  );
}

export default Section;
