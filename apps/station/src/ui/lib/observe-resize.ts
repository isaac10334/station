/** Coalesce measurements outside ResizeObserver delivery; cleanup cancels queued writes.
 * Use for callbacks that update React, canvas size, or layout styles.
 */
export function observeResize(elements: readonly Element[], measure: () => void) {
  let frame = 0;
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; measure(); });
  };
  const observer = new ResizeObserver(schedule);
  elements.forEach(element => observer.observe(element));
  schedule();
  return () => { observer.disconnect(); cancelAnimationFrame(frame); };
}
