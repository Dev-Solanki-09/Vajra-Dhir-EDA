import * as THREE from 'three';

let sharedRenderer: THREE.WebGLRenderer | null = null;
let attachedCanvas: HTMLCanvasElement | null = null;
let pendingRenderFrame = 0;

/**
 * Returns the single persistent reusable WebGLRenderer for the open project.
 * Prevents WebGL context explosion across Persona / Dockview panel switches.
 */
export function acquireProjectWebGLRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  if (sharedRenderer && attachedCanvas === canvas) {
    return sharedRenderer;
  }
  if (sharedRenderer && attachedCanvas !== canvas) {
    try {
      sharedRenderer.dispose();
    } catch {
      /* ignore */
    }
    sharedRenderer = null;
    attachedCanvas = null;
  }

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x141416, 1);
  renderer.localClippingEnabled = true;

  sharedRenderer = renderer;
  attachedCanvas = canvas;
  return renderer;
}

export function releaseCanvasReference(canvas: HTMLCanvasElement): void {
  if (attachedCanvas === canvas) {
    // Keep renderer reusable across panel mounts if same canvas, or clean pending RAF
    if (pendingRenderFrame) {
      cancelAnimationFrame(pendingRenderFrame);
      pendingRenderFrame = 0;
    }
  }
}

export function disposeProjectWebGLRenderer(): void {
  if (pendingRenderFrame) {
    cancelAnimationFrame(pendingRenderFrame);
    pendingRenderFrame = 0;
  }
  if (sharedRenderer) {
    try {
      sharedRenderer.dispose();
      sharedRenderer.forceContextLoss();
    } catch {
      /* ignore unsupported drivers */
    }
    sharedRenderer = null;
    attachedCanvas = null;
  }
}

export function scheduleOnDemandRender(renderFn: () => void): void {
  if (pendingRenderFrame) return;
  pendingRenderFrame = requestAnimationFrame(() => {
    pendingRenderFrame = 0;
    renderFn();
  });
}

export function getActiveWebGLContextCount(): number {
  return sharedRenderer ? 1 : 0;
}
