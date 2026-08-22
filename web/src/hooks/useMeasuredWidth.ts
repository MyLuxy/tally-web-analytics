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
//
// `cap` matters just as much as the floor this was built for: on a desktop
// sheet the container is routinely *wider* than the old fixed design width
// used to be, and that old width being upscaled by the CSS is exactly what
// made that text read as comfortably big there -- without a cap, "real
// pixels" on a wide screen means noticeably *smaller* text than before,
// not just fixing small screens. Capping at the original design width
// reproduces the old (upscaled) desktop look exactly, and still shrinks
// for real below that.
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
