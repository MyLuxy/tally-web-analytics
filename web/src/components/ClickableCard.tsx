import type { CSSProperties, KeyboardEvent, ReactNode } from "react";

// whole tile is the click target for the ExpandSheet in App.tsx. cardKey only wears the view-transition-name while actually transitioning, otherwise every idle card would fight for the same layer and flicker
// expanded stays true the whole sheet's open (not just mid-transition) so we hide the card instead of it showing through as a ghost duplicate behind the backdrop
export function ClickableCard({
  cardKey,
  expanded,
  transitioning,
  onExpand,
  ariaLabel,
  className,
  children,
}: {
  cardKey: string;
  expanded: boolean;
  transitioning: boolean;
  onExpand: () => void;
  ariaLabel: string;
  className?: string;
  children: ReactNode;
}) {
  const style: CSSProperties = {
    viewTransitionName: transitioning ? `card-${cardKey}` : undefined,
    visibility: expanded ? "hidden" : undefined,
  } as CSSProperties;

  return (
    <section
      // card-transitioning lets title/content morph on their own instead of just crossfading with the rest, see styles.css
      className={`panel panel-clickable${transitioning ? " card-transitioning" : ""}${className ? ` ${className}` : ""}`}
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
