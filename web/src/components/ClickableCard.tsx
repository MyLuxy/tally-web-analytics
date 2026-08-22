import type { CSSProperties, KeyboardEvent, ReactNode } from "react";

// Shared shell for every card that expands into a full-screen sheet on click
// (see App.tsx's <ExpandSheet>) -- the whole tile is the click target, not a
// button buried inside it. `cardKey` becomes the CSS view-transition-name
// this card morphs from, but only for the moment it's actually opening or
// closing (`transitioning` true) -- at rest, whether the sheet is open or
// not, the card carries no name at all. Only one element on the page should
// ever wear a given name when the browser grabs its before/after snapshots;
// giving every idle card a permanent name promoted them all into their own
// layer and made them flash in front of the one actually animating. See
// App.tsx's `transitioningKey` for who's currently allowed to wear it.
export function ClickableCard({
  cardKey,
  transitioning,
  onExpand,
  ariaLabel,
  className,
  children,
}: {
  cardKey: string;
  transitioning: boolean;
  onExpand: () => void;
  ariaLabel: string;
  className?: string;
  children: ReactNode;
}) {
  const style: CSSProperties = { viewTransitionName: transitioning ? `card-${cardKey}` : undefined } as CSSProperties;

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
