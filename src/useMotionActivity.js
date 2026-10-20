import { useEffect, useState } from 'react';

/**
 * @param {import('react').RefObject<HTMLElement>} target
 * @param {boolean} paused
 * @returns {{active: boolean, reduced: boolean}} Callers own and cancel their animation work.
 */
export function useMotionActivity(target, paused = false) {
  const [visible, setVisible] = useState(!document.hidden);
  const [intersecting, setIntersecting] = useState(false);
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onPreference = () => setReduced(media.matches);
    const onVisibility = () => setVisible(!document.hidden);
    const observer = new IntersectionObserver(([entry]) => setIntersecting(entry.isIntersecting), {
      threshold: 0.05,
    });
    if (target.current) observer.observe(target.current);
    media.addEventListener('change', onPreference);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      observer.disconnect();
      media.removeEventListener('change', onPreference);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [target]);

  return { active: visible && intersecting && !reduced && !paused, reduced };
}
