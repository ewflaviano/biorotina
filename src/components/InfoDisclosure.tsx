import { Info } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export function InfoDisclosure({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const contentId = useId();
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const content = contentRef.current;
    if (
      content &&
      content.getBoundingClientRect().bottom > window.innerHeight - 72
    )
      content.scrollIntoView?.({ block: "nearest" });
  }, [open]);

  return (
    <div className="info-disclosure">
      <button
        type="button"
        className="info-disclosure-trigger"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((value) => !value)}
      >
        <Info size={17} aria-hidden="true" />
        <span>{label}</span>
      </button>
      {open && (
        <div
          ref={contentRef}
          id={contentId}
          className="info-disclosure-content"
        >
          {children}
        </div>
      )}
    </div>
  );
}
