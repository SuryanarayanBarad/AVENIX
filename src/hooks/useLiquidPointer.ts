import { useEffect } from 'react';

/**
 * Makes the specular highlight follow the pointer.
 *
 * A fixed highlight is what gives most CSS "glass" away: real glass catches
 * light from wherever you are looking at it. Writing the pointer position onto
 * the hovered control as --lg-x / --lg-y lets the CSS place its highlight there,
 * so the pane looks lit rather than printed.
 *
 * One delegated listener for the whole document rather than one per control —
 * there are ~200 buttons in this app, and 200 listeners plus 200 React state
 * updates per mouse move is not worth a highlight. Coordinates are written
 * straight to the style attribute inside a rAF, so this never triggers a
 * render.
 *
 * Skipped entirely for coarse pointers, where there is no hover to track, and
 * for anyone who has asked for reduced motion.
 */
export function useLiquidPointer(): void {
  useEffect(() => {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!fine.matches || calm.matches) return;

    let frame = 0;
    let pending: { el: HTMLElement; x: number; y: number } | null = null;
    let current: HTMLElement | null = null;

    const paint = () => {
      frame = 0;
      if (!pending) return;
      const { el, x, y } = pending;
      el.style.setProperty('--lg-x', `${x}%`);
      el.style.setProperty('--lg-y', `${y}%`);
      pending = null;
    };

    const onMove = (event: PointerEvent) => {
      const target = (event.target as Element | null)?.closest?.(
        '.liquid-glass, .liquid-glass-active',
      ) as HTMLElement | null;

      if (target !== current) {
        // Leaving a control resets it, so the highlight does not freeze
        // wherever the pointer happened to exit.
        current?.style.removeProperty('--lg-x');
        current?.style.removeProperty('--lg-y');
        current = target;
      }
      if (!target) return;

      const rect = target.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      pending = {
        el: target,
        x: ((event.clientX - rect.left) / rect.width) * 100,
        y: ((event.clientY - rect.top) / rect.height) * 100,
      };
      if (!frame) frame = requestAnimationFrame(paint);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      if (frame) cancelAnimationFrame(frame);
      current?.style.removeProperty('--lg-x');
      current?.style.removeProperty('--lg-y');
    };
  }, []);
}
