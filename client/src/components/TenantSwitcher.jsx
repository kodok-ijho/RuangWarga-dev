import { useState, useRef, useEffect } from 'react';
import { AiOutlineDown, AiOutlineCheck, AiOutlineSwap } from 'react-icons/ai';
import { useTenant } from '../hooks/useTenant';

const TYPE_ICONS = {
  rt_rw: '🏘️',
  kos: '🏢',
  arisan: '🎲',
  kelas: '📚',
};

const TYPE_LABELS = {
  rt_rw: 'RT/RW',
  kos: 'Kos-Kosan',
  arisan: 'Arisan',
  kelas: 'Kelas',
};

const STATUS_STYLES = {
  active: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  trial: 'bg-amber-50 text-amber-800 border-amber-200',
  read_only: 'bg-rose-50 text-rose-800 border-rose-200',
};

export default function TenantSwitcher({ isMobile = false }) {
  const {
    activeTenant,
    activeTenantId,
    userTenants,
    switchTenant,
    subscriptionStatus,
  } = useTenant();

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!userTenants || userTenants.length === 0) {
    return null;
  }

  const currentType = activeTenant?.type || 'rt_rw';
  const typeIcon = TYPE_ICONS[currentType] || '🏘️';
  const typeLabel = TYPE_LABELS[currentType] || currentType;
  const statusStyle = STATUS_STYLES[subscriptionStatus] || STATUS_STYLES.trial;

  // Jika hanya ada 1 tenant dan bukan mobile, tampilkan badge ringkas
  if (userTenants.length <= 1 && !isMobile) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-lg border border-slate-200 text-xs">
        <span className="text-sm">{typeIcon}</span>
        <span className="font-semibold text-slate-800 max-w-[140px] truncate" title={activeTenant?.name}>
          {activeTenant?.name || 'Komunitas Anda'}
        </span>
        <span className={`text-[10px] px-1.5 py-0.2 rounded border font-bold uppercase ${statusStyle}`}>
          {subscriptionStatus === 'trial' ? 'Trial' : subscriptionStatus === 'active' ? 'Aktif' : 'Read-Only'}
        </span>
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-all text-xs font-medium ${
          isOpen
            ? 'bg-slate-100 text-slate-900 border-slate-300 shadow-xs ring-2 ring-slate-900/10'
            : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-200 shadow-2xs'
        }`}
        title="Ganti Komunitas / Layanan"
      >
        <span className="text-sm shrink-0">{typeIcon}</span>
        <div className="text-left min-w-0">
          <p className="leading-tight max-w-[130px] truncate font-bold text-slate-900">
            {activeTenant?.name || 'Pilih Komunitas'}
          </p>
          <p className="text-[9px] text-slate-500 font-normal leading-none mt-0.5">
            {typeLabel} &bull; <span className="capitalize">{subscriptionStatus}</span>
          </p>
        </div>
        {userTenants.length > 1 && (
          <AiOutlineDown className={`text-[10px] ml-1 transition-transform shrink-0 ${isOpen ? 'rotate-180 text-slate-900' : 'text-slate-400'}`} />
        )}
      </button>

      {isOpen && userTenants.length > 1 && (
        <div className="absolute left-0 mt-1.5 w-64 bg-white border border-slate-200 rounded-xl shadow-rw-popover overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150">
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-[11px] text-slate-600 font-bold uppercase tracking-wider">
            <span>Daftar Komunitas ({userTenants.length})</span>
            <AiOutlineSwap className="text-xs text-slate-500" />
          </div>

          <div className="max-h-60 overflow-y-auto py-1 divide-y divide-slate-100">
            {userTenants.map((tenant) => {
              const isSelected = tenant.id === activeTenantId;
              const itemType = tenant.type || 'rt_rw';
              const itemIcon = TYPE_ICONS[itemType] || '🏘️';
              const itemLabel = TYPE_LABELS[itemType] || itemType;
              const subStatus = tenant.subscription?.status || 'trial';
              const itemStatusStyle = STATUS_STYLES[subStatus] || STATUS_STYLES.trial;

              return (
                <button
                  key={tenant.id}
                  type="button"
                  onClick={() => {
                    switchTenant(tenant.id);
                    setIsOpen(false);
                  }}
                  className={`w-full px-3 py-2.5 text-left flex items-start gap-2.5 transition-colors ${
                    isSelected
                      ? 'bg-slate-100/90 text-slate-900 font-semibold border-l-2 border-slate-900'
                      : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <span className="text-base mt-0.5 shrink-0">{itemIcon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate leading-tight text-slate-900">{tenant.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] text-slate-500">{itemLabel}</span>
                      <span className="text-[9px] text-slate-400">&bull;</span>
                      <span className={`text-[9px] px-1 py-0.2 rounded border uppercase font-bold ${itemStatusStyle}`}>
                        {subStatus}
                      </span>
                    </div>
                  </div>
                  {isSelected && <AiOutlineCheck className="text-slate-900 text-sm mt-1 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
