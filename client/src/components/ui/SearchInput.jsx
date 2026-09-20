import React from 'react';
import { AiOutlineSearch, AiOutlineClose } from 'react-icons/ai';

/**
 * SearchInput (Phase 7 — Data-heavy Screens)
 *
 * Input pencarian standar dengan ikon pembesar, tombol hapus instan (clear),
 * dan touch target aksesibel.
 */
export function SearchInput({
  value = '',
  onChange,
  onClear,
  placeholder = 'Cari...',
  className = '',
  id,
  ariaLabel = 'Pencarian data',
  ...props
}) {
  const handleClear = () => {
    if (onClear) {
      onClear();
    } else if (onChange) {
      onChange({ target: { value: '' } });
    }
  };

  return (
    <div className={`relative flex items-center min-h-[44px] ${className}`}>
      <AiOutlineSearch
        className="pointer-events-none absolute left-3.5 text-slate-400 text-base shrink-0"
        aria-hidden="true"
      />
      <input
        id={id}
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="w-full h-11 min-h-[44px] pl-10 pr-9 text-xs sm:text-sm rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 hover:border-slate-300 focus:outline-hidden focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors shadow-2xs"
        {...props}
      />
      {value && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2.5 inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 focus:outline-hidden transition-colors"
          title="Hapus kata kunci pencarian"
          aria-label="Hapus kata kunci pencarian"
        >
          <AiOutlineClose className="text-xs" />
        </button>
      )}
    </div>
  );
}

export default SearchInput;
