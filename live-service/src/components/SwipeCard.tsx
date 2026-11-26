import React, { useRef, useState } from "react";
/** Horizontal feedback only. Vertical scrolling and taps retain their normal meaning. */
export default function SwipeCard({
  children,
  onLeft,
  onRight,
}: {
  children: React.ReactNode;
  onLeft: () => void;
  onRight: () => void;
}) {
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const [offset, setOffset] = useState(0);
  const finish = (e: React.PointerEvent, cancelled = false) => {
    const origin = start.current;
    if (!origin || origin.id !== e.pointerId) return;
    start.current = null;
    const dx = e.clientX - origin.x,
      dy = e.clientY - origin.y;
    setOffset(0);
    if (!cancelled && Math.abs(dx) > 88 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      dx > 0 ? onRight() : onLeft();
    }
  };
  return (
    <article
      className="insight swipe-card"
      style={{
        transform: `translateX(${offset * 0.55}px) rotate(${offset / 35}deg)`,
      }}
      onPointerDown={(e) => {
        if (
          e.button !== 0 ||
          (e.target as HTMLElement).closest(
            "button,a,input,textarea,summary,details",
          )
        )
          return;
        start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const origin = start.current;
        if (!origin || origin.id !== e.pointerId) return;
        const dx = e.clientX - origin.x,
          dy = e.clientY - origin.y;
        if (Math.abs(dx) > Math.abs(dy))
          setOffset(Math.max(-160, Math.min(160, dx)));
      }}
      onPointerUp={(e) => finish(e)}
      onPointerCancel={(e) => finish(e, true)}
      onLostPointerCapture={() => {
        start.current = null;
        setOffset(0);
      }}
    >
      {Math.abs(offset) > 24 && (
        <span
          className={`swipe-cue ${offset > 0 ? "right" : "left"}`}
          aria-hidden="true"
        >
          {offset > 0 ? "Keep exploring" : "Not quite"}
        </span>
      )}
      {children}
    </article>
  );
}
