import React, { useState, useRef, useEffect } from 'react';

export function Dropdown({
  trigger,
  children,
  align = 'right',
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const alignClass =
    align === 'left'
      ? 'left-0 origin-top-left'
      : align === 'center'
      ? 'left-1/2 -translate-x-1/2 origin-top'
      : 'right-0 origin-top-right';

  return (
    <div ref={dropdownRef} className={`relative inline-block text-left ${className}`}>
      <div onClick={() => setIsOpen(!isOpen)} className="cursor-pointer">
        {trigger}
      </div>

      {isOpen && (
        <div
          role="menu"
          aria-orientation="vertical"
          className={`absolute ${alignClass} mt-2 w-56 rounded-xl bg-white border border-slate-200 shadow-rw-popover p-1.5 z-50 focus:outline-none animate-in fade-in zoom-in-95 duration-150`}
        >
          {typeof children === 'function' ? children({ close: () => setIsOpen(false) }) : children}
        </div>
      )}
    </div>
  );
}

export function DropdownItem({
  children,
  onClick,
  icon: Icon,
  danger = false,
  disabled = false,
  className = '',
}) {
  return (
    <button
      role="menuitem"
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg text-left transition-colors ${
        danger
          ? 'text-rose-600 hover:bg-rose-50'
          : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
      } disabled:opacity-50 disabled:pointer-events-none ${className}`}
    >
      {Icon && <Icon className="text-base shrink-0" aria-hidden="true" />}
      <span className="flex-1 truncate">{children}</span>
    </button>
  );
}

export default Dropdown;
