import type { CSSProperties, KeyboardEvent, ReactNode } from "react";

// Shared shell for every card that expands into a full-screen sheet on click
// (see App.tsx's <ExpandSheet>) -- the whole tile is the click target, not a
// button buried inside it. `cardKey` becomes the CSS view-transition-name
// this card morphs from; it's only worn while the card is in its compact
// form -- the moment its own sheet is open, the *sheet* wears the same name
// instead, which is what makes the browser's default View Transition
// interpolate card-rect -> full-screen-rect instead of just crossfading.
//
// The 3D hover tilt itself is plain CSS (see .panel-clickable:hover) -- a
// fixed lift/rotation, the same every time, not something that tracks the
// cursor's position over the card.
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
    >
      {children}
    </section>
  );
}
