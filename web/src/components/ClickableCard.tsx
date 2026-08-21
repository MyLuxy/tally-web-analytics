import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from "react";

// Caps how far the card tilts toward the cursor -- big enough to read as a
// physical object, small enough to stay "slight" rather than a gimmick.
const MAX_TILT_DEG = 7;
const HOVER_LIFT_PX = 7;

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Shared shell for every card that expands into a full-screen sheet on click
// (see App.tsx's <ExpandSheet>) -- the whole tile is the click target, not a
// button buried inside it. `cardKey` becomes the CSS view-transition-name
// this card morphs from; it's only worn while the card is in its compact
// form -- the moment its own sheet is open, the *sheet* wears the same name
// instead, which is what makes the browser's default View Transition
// interpolate card-rect -> full-screen-rect instead of just crossfading.
//
// On top of that, the card tilts in 3D toward wherever the cursor is over it
// (a couple of CSS custom properties read by .panel-clickable in styles.css)
// -- purely a hover flourish, so it's skipped outright under
// prefers-reduced-motion and never fires on touch (no pointermove there).
export function ClickableCard({
  cardKey,
  expanded,
  onExpand,
  ariaLabel,
  className,
  children,
}: {
  cardKey: string;
  expanded: boolean;
  onExpand: () => void;
  ariaLabel: string;
  className?: string;
  children: ReactNode;
}) {
  const style: CSSProperties = { viewTransitionName: expanded ? undefined : `card-${cardKey}` } as CSSProperties;

  function handlePointerMove(e: PointerEvent<HTMLElement>) {
    if (e.pointerType !== "mouse" || prefersReducedMotion()) return;
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width; // 0 (left edge) .. 1 (right edge)
    const py = (e.clientY - rect.top) / rect.height;
    el.style.setProperty("--tilt-y", `${((px - 0.5) * MAX_TILT_DEG * 2).toFixed(2)}deg`);
    el.style.setProperty("--tilt-x", `${((0.5 - py) * MAX_TILT_DEG * 2).toFixed(2)}deg`);
  }

  function handlePointerEnter(e: PointerEvent<HTMLElement>) {
    if (e.pointerType !== "mouse" || prefersReducedMotion()) return;
    e.currentTarget.style.setProperty("--tilt-z", `${HOVER_LIFT_PX}px`);
  }

  function resetTilt(e: PointerEvent<HTMLElement>) {
    const el = e.currentTarget;
    el.style.removeProperty("--tilt-x");
    el.style.removeProperty("--tilt-y");
    el.style.removeProperty("--tilt-z");
  }

  return (
    <section
      className={`panel panel-clickable${className ? ` ${className}` : ""}`}
      style={style}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onClick={onExpand}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onExpand();
        }
      }}
      onPointerEnter={handlePointerEnter}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetTilt}
    >
      {children}
    </section>
  );
}
