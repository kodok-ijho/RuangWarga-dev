import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTour } from '../context/TourContext';
import { AiOutlineClose, AiOutlineArrowRight, AiOutlineArrowLeft } from 'react-icons/ai';

/**
 * Helper to find the first actually visible element matching selectors.
 */
function findVisibleElement(targetSelector, fallbackSelector) {
  const trySelector = (sel) => {
    if (!sel) return null;
    try {
      const elements = document.querySelectorAll(sel);
      for (const el of elements) {
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        // Element is visible if it has non-zero dimensions and is not hidden
        if (rect.width > 10 && rect.height > 10 && el.offsetParent !== null) {
          return { el, rect };
        }
      }
    } catch (e) {
      console.warn('Tour selector error:', e);
    }
    return null;
  };

  return trySelector(targetSelector) || trySelector(fallbackSelector) || null;
}

export default function WalkthroughTour() {
  const {
    isOpen,
    currentStepIndex,
    totalSteps,
    currentStep,
    nextStep,
    prevStep,
    skipTour,
  } = useTour();

  const [rect, setRect] = useState(null);
  const [cardStyle, setCardStyle] = useState({});
  const [isMobileView, setIsMobileView] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef(null);

  // Update spotlight rect and card position based on current DOM state
  const updatePosition = useCallback(() => {
    if (!isOpen || !currentStep) return;

    const isMobile = window.innerWidth < 768;
    setIsMobileView(isMobile);

    const found = findVisibleElement(currentStep.targetSelector, currentStep.fallbackSelector);

    if (!found) {
      setRect(null);
      // Even if no specific target is found, show the card safely on screen
      if (isMobile) {
        setCardStyle({
          position: 'fixed',
          bottom: '16px',
          left: '12px',
          right: '12px',
          width: 'auto',
          maxWidth: '100%',
        });
      } else {
        setCardStyle({
          position: 'fixed',
          top: '90px',
          right: '24px',
          width: '360px',
        });
      }
      return;
    }

    const b = found.el.getBoundingClientRect();
    const padding = isMobile ? 6 : 8;

    // Spotlight clamped within viewport
    const clampedTop = Math.max(6, b.top - padding);
    const clampedLeft = Math.max(6, b.left - padding);
    const clampedRight = Math.min(window.innerWidth - 6, b.right + padding);
    const clampedBottom = Math.min(window.innerHeight - 6, b.bottom + padding);

    const targetRect = {
      top: clampedTop,
      left: clampedLeft,
      width: Math.max(20, clampedRight - clampedLeft),
      height: Math.max(20, clampedBottom - clampedTop),
      bottom: clampedBottom,
      right: clampedRight,
    };

    setRect(targetRect);

    // Hitung posisi Tooltip Card
    if (isMobile) {
      // Pada Mobile / PWA:
      // Jika elemen target berada di bagian bawah layar (center > 55% height),
      // posisikan kartu di ATAS agar tidak menutupi elemen.
      // Jika elemen target berada di atas layar, posisikan kartu di BAWAH.
      const targetCenterY = (b.top + b.bottom) / 2;
      const isTargetInLowerHalf = targetCenterY > window.innerHeight * 0.52;

      if (isTargetInLowerHalf) {
        setCardStyle({
          position: 'fixed',
          top: '16px',
          left: '12px',
          right: '12px',
          width: 'auto',
        });
      } else {
        setCardStyle({
          position: 'fixed',
          bottom: '16px',
          left: '12px',
          right: '12px',
          width: 'auto',
        });
      }
    } else {
      // Pada Desktop (>= 768px):
      // Tooltip Card mengambang (floating) di atas / bawah elemen dengan boundary checks
      const cardWidth = 360;
      const cardHeight = 210;
      const margin = 14;

      let left = targetRect.left + targetRect.width / 2 - cardWidth / 2;
      if (left < 16) left = 16;
      if (left + cardWidth > window.innerWidth - 16) {
        left = window.innerWidth - 16 - cardWidth;
      }

      const spaceBelow = window.innerHeight - targetRect.bottom;
      const spaceAbove = targetRect.top;

      let top = 0;
      if (spaceBelow >= cardHeight + margin || spaceBelow >= spaceAbove) {
        top = Math.min(window.innerHeight - cardHeight - 16, targetRect.bottom + margin);
      } else {
        top = Math.max(16, targetRect.top - cardHeight - margin);
      }

      setCardStyle({
        position: 'fixed',
        top: `${top}px`,
        left: `${left}px`,
        width: `${cardWidth}px`,
      });
    }
  }, [isOpen, currentStep]);

  // One-time smooth scroll saat step berganti
  useEffect(() => {
    if (!isOpen || !currentStep) return;

    let isMounted = true;
    const isMobile = window.innerWidth < 768;

    const performInitialScroll = () => {
      if (!isMounted) return;
      const found = findVisibleElement(currentStep.targetSelector, currentStep.fallbackSelector);
      if (found) {
        const b = found.el.getBoundingClientRect();
        const absoluteTop = window.scrollY + b.top;
        const offset = isMobile ? 80 : 120;
        window.scrollTo({
          top: Math.max(0, absoluteTop - offset),
          behavior: 'smooth',
        });
      }
    };

    // Lakukan scroll sekali dengan delay sedikit untuk memastikan rendering komponen
    const scrollTimer = setTimeout(performInitialScroll, 120);

    return () => {
      isMounted = false;
      clearTimeout(scrollTimer);
    };
  }, [isOpen, currentStepIndex, currentStep]);

  // Listeners untuk update koordinat saat scroll / resize (TANPA re-trigger scrollIntoView)
  useEffect(() => {
    if (!isOpen) {
      setIsVisible(false);
      setRect(null);
      return;
    }

    setIsVisible(true);
    updatePosition();

    // Retries untuk transisi halaman yang async
    const t1 = setTimeout(updatePosition, 100);
    const t2 = setTimeout(updatePosition, 300);
    const t3 = setTimeout(updatePosition, 600);
    const t4 = setTimeout(updatePosition, 1000);

    const handleUpdate = () => {
      requestAnimationFrame(updatePosition);
    };

    window.addEventListener('resize', handleUpdate, { passive: true });
    window.addEventListener('scroll', handleUpdate, { passive: true });

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      window.removeEventListener('resize', handleUpdate);
      window.removeEventListener('scroll', handleUpdate);
    };
  }, [isOpen, currentStepIndex, updatePosition]);

  if (!isOpen || !isVisible || !currentStep) return null;

  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === totalSteps - 1;

  return createPortal(
    <div className="fixed inset-0 z-[999999] pointer-events-auto select-none">
      {/* ── Spotlight Cutout & Dark Scrim ── */}
      {rect ? (
        <div
          className="fixed transition-all duration-300 ease-out rounded-2xl border-2 border-gold-400 pointer-events-none"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            boxShadow: '0 0 0 9999px rgba(8, 26, 17, 0.82), 0 0 25px rgba(212, 175, 55, 0.45)',
          }}
        >
          {/* Spotlight Ping Glow */}
          <span className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gold-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-gold-500 border border-white"></span>
          </span>
        </div>
      ) : (
        /* Fallback dark overlay full screen saat elemen sedang dimuat */
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-300" />
      )}

      {/* ── Responsive Tooltip Popover Card ── */}
      <div
        ref={cardRef}
        style={cardStyle}
        className="z-[1000000] rounded-2xl bg-[#0f172a]/95 backdrop-blur-md border border-slate-700/80 shadow-[0_20px_50px_rgba(0,0,0,0.7)] text-white p-4 sm:p-5 transition-all duration-300 ease-out"
      >
        {/* Header Card */}
        <div className="flex items-center justify-between gap-3 mb-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 px-3 py-0.5 text-[11px] font-bold text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {totalSteps > 1 ? `Langkah ${currentStepIndex + 1} dari ${totalSteps}` : 'Info Panduan'}
          </span>
          <button
            type="button"
            onClick={skipTour}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
            title="Tutup Panduan"
          >
            <AiOutlineClose className="text-base" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-1.5">
          <h4 className="text-sm sm:text-base font-bold text-white tracking-tight leading-snug">
            {currentStep.title}
          </h4>
          <p className="text-xs sm:text-[13px] text-slate-300 leading-relaxed">
            {currentStep.description}
          </p>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between gap-2 pt-3.5 mt-2.5 border-t border-slate-700/70">
          <button
            type="button"
            onClick={skipTour}
            className="text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors underline-offset-4 hover:underline py-1.5"
          >
            Tutup
          </button>

          <div className="flex items-center gap-2">
            {!isFirstStep && (
              <button
                type="button"
                onClick={prevStep}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-600/60 transition-all shadow-sm active:scale-95"
              >
                <AiOutlineArrowLeft className="text-xs" /> Kembali
              </button>
            )}

            <button
              type="button"
              onClick={nextStep}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-900/40 transition-all hover:scale-[1.02] active:scale-95"
            >
              <span>{isLastStep ? (totalSteps === 1 ? 'Paham 👍' : 'Selesai 👍') : 'Lanjut'}</span>
              {!isLastStep && <AiOutlineArrowRight className="text-xs" />}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
