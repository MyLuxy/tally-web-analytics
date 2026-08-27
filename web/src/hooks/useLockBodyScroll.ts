import { useEffect } from "react";

// locking just body.style.overflow does nothing in most browsers -- with no
// explicit height on <html>/<body>, it's <html> that's actually the
// scrolling element, not <body>. gotta hide the scrollbar on both.
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
