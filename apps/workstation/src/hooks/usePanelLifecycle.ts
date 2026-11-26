import { useEffect, useRef } from 'react';
import { IDockviewPanelProps } from 'dockview-react';

export interface PanelLifecycleOptions {
  onShow?: (width: number, height: number) => void;
  onHide?: () => void;
  onResize?: (width: number, height: number) => void;
}

/**
 * Shared Dockview panel lifecycle hook with rAF-coalesced dimension changes
 * and zero 0x0 canvas redraws when panes switch visibility.
 */
export function usePanelLifecycle(
  panelApi: IDockviewPanelProps['api'] | undefined,
  containerRef: React.RefObject<HTMLElement | null>,
  options: PanelLifecycleOptions
): void {
  const optsRef = useRef(options);
  optsRef.current = options;

  useEffect(() => {
    if (!panelApi) return;
    let rafId = 0;

    const measureAndResize = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const el = containerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const w = Math.floor(rect.width);
        const h = Math.floor(rect.height);
        if (w > 0 && h > 0) {
          optsRef.current.onResize?.(w, h);
        }
      });
    };

    const dimSub = panelApi.onDidDimensionsChange(() => {
      measureAndResize();
    });

    const visSub = panelApi.onDidVisibilityChange((ev) => {
      if (ev.isVisible) {
        requestAnimationFrame(() => {
          const el = containerRef.current;
          if (!el) return;
          const rect = el.getBoundingClientRect();
          const w = Math.floor(rect.width);
          const h = Math.floor(rect.height);
          if (w > 0 && h > 0) {
            optsRef.current.onShow?.(w, h);
          }
        });
      } else {
        cancelAnimationFrame(rafId);
        optsRef.current.onHide?.();
      }
    });

    return () => {
      cancelAnimationFrame(rafId);
      dimSub.dispose();
      visSub.dispose();
    };
  }, [panelApi, containerRef]);
}
