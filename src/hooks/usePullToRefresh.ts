import { useEffect, useRef, useState } from "react";

const THRESHOLD_PX = 80;

/**
 * Pull-to-refresh on the document scroll. The page must start at
 * `window.scrollY === 0` for the gesture to arm. Touches that begin inside
 * an element marked with `data-pull-disable` (e.g. a modal) are ignored so
 * modal scrolling doesn't trigger a refresh.
 *
 * Returns `{ armed }` — true while the user has dragged past the threshold
 * but hasn't released yet. Use it to render a "Release to refresh" hint.
 */
export function usePullToRefresh({
  onRefresh,
  enabled = true,
}: {
  onRefresh: () => void | Promise<void>;
  enabled?: boolean;
}): { armed: boolean } {
  const [armed, setArmed] = useState(false);
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    if (!enabled) return;

    let tracking = false;
    let startY = 0;
    let armedNow = false;

    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY > 0) {
        tracking = false;
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-pull-disable]")) {
        tracking = false;
        return;
      }
      const t = e.touches[0];
      if (!t) return;
      tracking = true;
      startY = t.clientY;
      armedNow = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!tracking) return;
      // User has scrolled — abandon the gesture.
      if (window.scrollY > 0) {
        tracking = false;
        if (armedNow) {
          armedNow = false;
          setArmed(false);
        }
        return;
      }
      const t = e.touches[0];
      if (!t) return;
      const dy = t.clientY - startY;
      const isArmed = dy > THRESHOLD_PX;
      if (isArmed !== armedNow) {
        armedNow = isArmed;
        setArmed(isArmed);
      }
    };

    const onTouchEnd = () => {
      if (!tracking) return;
      const wasArmed = armedNow;
      tracking = false;
      armedNow = false;
      setArmed(false);
      if (wasArmed) {
        void onRefreshRef.current();
      }
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [enabled]);

  return { armed };
}
