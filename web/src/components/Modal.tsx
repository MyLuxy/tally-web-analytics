// Shared small-dialog chrome -- Settings, the CSV export confirm, and
// anything else that isn't the full-screen ExpandSheet all use this, so
// they read as one family instead of each rolling its own modal.
import type { ReactNode } from "react";
import { useEffect } from "react";
import { createPortal } from "react-dom";

export function Modal({
  title,
  onClose,
  children,
  actions,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  // Portalled to document.body -- some callers (the CSV export confirm)
  // open from inside a card that gets a hover/active transform, and a
  // transformed ancestor turns position:fixed into "fixed to that
  // ancestor" instead of the viewport.
  return createPortal(
    <div
      className="modal-overlay"
      role="presentation"
      onClick={(e) => {
        // portal clicks still bubble through the React tree (not the DOM),
        // so without this, dismissing via the backdrop could also reach
        // whatever's underneath (e.g. the card the export button sits in)
        e.stopPropagation();
        onClose();
      }}
    >
      {/* stop clicks inside the dialog from bubbling up and closing it */}
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 className="modal-title">{title}</h2>
          <div className="modal-head-actions">
            {actions}
            <button type="button" className="modal-close" onClick={onClose} aria-label="Close" title="Close">
              <CloseIcon />
            </button>
          </div>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
