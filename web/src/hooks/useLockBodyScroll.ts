import { useEffect } from "react";

// body.style.overflow alone does nothing in most browsers, html is the actual scrolling element without an explicit height set. hide both.
export function useLockBodyScroll(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    const prevRoot = root.style.overflow;
    const prevBody = document.body.style.overflow;
    root.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      root.style.overflow = prevRoot;
      document.body.style.overflow = prevBody;
    };
  }, [active]);
}
