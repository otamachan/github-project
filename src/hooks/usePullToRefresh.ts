import { useEffect, useRef, useState } from "react";

const RESISTANCE = 0.5;
const MAX_PULL = 120;
const TRIGGER = 60;

/**
 * Pull-to-refresh for installed PWA where the browser chrome (and its
 * own pull-to-refresh) is hidden. Returns the current pull distance in
 * px so the caller can render a visual indicator; on release past the
 * trigger threshold this fires a full page reload.
 *
 * Only engages while the document is already scrolled to the very top
 * (so it doesn't fight with normal upward overscroll on inner content).
 */
export function usePullToRefresh(): number {
  const [distance, setDistance] = useState(0);
  const startY = useRef<number | null>(null);
  const distanceRef = useRef(0);

  useEffect(() => {
    const updateDistance = (d: number) => {
      distanceRef.current = d;
      setDistance(d);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY <= 0) {
        startY.current = e.touches[0]!.clientY;
      } else {
        startY.current = null;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (startY.current === null) return;
      const dy = e.touches[0]!.clientY - startY.current;
      updateDistance(dy > 0 ? Math.min(dy * RESISTANCE, MAX_PULL) : 0);
    };

    const onTouchEnd = () => {
      if (distanceRef.current > TRIGGER) {
        window.location.reload();
        return;
      }
      updateDistance(0);
      startY.current = null;
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", onTouchEnd);
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

  return distance;
}

export const PULL_TRIGGER = TRIGGER;
