import { useEffect, useRef, useState } from "react";

// The hand-rolled charts draw everything (text included) in SVG viewBox
// units, then let the SVG scale to fill its container via CSS -- so text
// sized to read well at some fixed "design" width quietly shrinks below
// legible the moment the container is actually narrower than that (a phone,
// most of the time). Chasing that with per-breakpoint magic numbers means
// re-tuning every time a new device/width shows up.
//
// The real fix: measure the container's actual rendered width and use that
// -- not a guessed design width -- as the viewBox width. 1 SVG unit then
// always equals 1 real CSS pixel, on any screen, so text set in "viewBox
// units" (e.g. font-size: 11) is always actually ~11px on screen. No
// breakpoints to maintain.
export function useMeasuredWidth(fallback: number) {
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

  return [ref, width] as const;
}
