"use client";

import { useEffect, useRef, useState } from "react";

/** Timings of the staged success animation: check mark first, then the request number. */
export const successRevealDelays = { check: 700, content: 2_000 } as const;

/**
 * Staged reveal of a "request accepted" screen.
 *
 * The delay is purely visual: the content stays in the accessibility tree (opacity only,
 * never `visibility: hidden`), the heading with the request number receives focus at once,
 * and visitors who prefer reduced motion see everything without waiting.
 */
export function useSuccessReveal(requestNumber: string | null) {
  // The stage belongs to one request number, so a new request always starts from zero.
  const [progress, setProgress] = useState({ requestNumber, stage: 0 });
  const headingRef = useRef<HTMLHeadingElement>(null);
  const stage = progress.requestNumber === requestNumber ? progress.stage : 0;

  useEffect(() => {
    if (!requestNumber) return;
    headingRef.current?.focus();
    const show = (nextStage: number) => () =>
      setProgress((current) => ({
        requestNumber,
        stage: Math.max(current.requestNumber === requestNumber ? current.stage : 0, nextStage),
      }));
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timers = reducedMotion
      ? [window.setTimeout(show(2), 0)]
      : [
          window.setTimeout(show(1), successRevealDelays.check),
          window.setTimeout(show(2), successRevealDelays.content),
        ];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [requestNumber]);

  return {
    stage,
    headingRef,
    /** Shows the content at once, e.g. when keyboard focus reaches a still transparent button. */
    reveal: () => setProgress({ requestNumber, stage: 2 }),
  };
}
