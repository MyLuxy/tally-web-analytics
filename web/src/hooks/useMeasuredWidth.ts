import { useEffect, useRef, useState } from "react";

// charts use the actual container width as the svg viewBox width, so 1 unit = 1 real px
// and text doesn't shrink on narrow screens. cap keeps it from getting too small on
// wide desktop screens too (text would look tiny otherwise)
export function useMeasuredWidth(fallback: number, cap: number = fallback) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, Math.min(width, cap)] as const;
}
