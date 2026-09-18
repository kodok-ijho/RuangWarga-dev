import React, { useEffect, useState, useRef } from 'react';

/**
 * AnimatedCounter
 * Signature moment untuk transisi angka metrik dashboard (400ms).
 * Menggunakan requestAnimationFrame dengan easeOutExpo agar terasa cepat, responsif, dan elegan.
 */
export default function AnimatedCounter({
  value = 0,
  duration = 450,
  formatter = (val) => String(Math.round(val)),
  className = '',
}) {
  const [displayValue, setDisplayValue] = useState(0);
  const startValRef = useRef(0);
  const startTimeRef = useRef(null);
  const targetValRef = useRef(value);
  const rafRef = useRef(null);

  useEffect(() => {
    targetValRef.current = Number(value) || 0;
    const startVal = displayValue;
    startValRef.current = startVal;
    startTimeRef.current = null;

    const easeOutExpo = (x) => (x === 1 ? 1 : 1 - Math.pow(2, -10 * x));

    const step = (timestamp) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutExpo(progress);

      const current = startValRef.current + (targetValRef.current - startValRef.current) * easedProgress;
      setDisplayValue(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        setDisplayValue(targetValRef.current);
      }
    };

    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  return <span className={className}>{formatter(displayValue)}</span>;
}
