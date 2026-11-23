/**
 * Vajra-Dhīr EDA — WebGPU CAD Canvas Engine
 * License: MIT OR Apache-2.0
 */

export interface ViewportState {
  panXNm: bigint;
  panYNm: bigint;
  zoomFactor: number;
  rotationMdeg: number;
}

export interface LayerStyle {
  color: string;
  opacity: number;
  visible: boolean;
}

export const SILICON_DARKROOM_PALETTE: Record<string, LayerStyle> = {
  "F.Cu": { color: "#E05D44", opacity: 0.85, visible: true },
  "In1.Cu": { color: "#3B82F6", opacity: 0.60, visible: true },
  "In2.Cu": { color: "#8B5CF6", opacity: 0.60, visible: true },
  "B.Cu": { color: "#10B981", opacity: 0.85, visible: true },
  "F.SilkS": { color: "#F8FAFC", opacity: 0.95, visible: true },
  "B.SilkS": { color: "#94A3B8", opacity: 0.95, visible: true },
  "Edge.Cuts": { color: "#EAB308", opacity: 1.0, visible: true },
  "Highlight": { color: "#38BDF8", opacity: 1.0, visible: true },
};

export type RenderBackend = "webgpu" | "webgl2" | "software_canvas";

export class WebGpuCadEngine {
  private backend: RenderBackend = "software_canvas";
  private viewport: ViewportState = {
    panXNm: 0n,
    panYNm: 0n,
    zoomFactor: 1.0,
    rotationMdeg: 0,
  };
  private targetFps: number = 60;
  private activeNetHighlight: string | null = null;
  private activeComponentHighlight: string | null = null;

  constructor(hasWebGpuSupport: boolean = false, hasWebGL2Support: boolean = true) {
    if (hasWebGpuSupport) {
      this.backend = "webgpu";
      this.targetFps = 120;
    } else if (hasWebGL2Support) {
      this.backend = "webgl2";
      this.targetFps = 60;
    } else {
      this.backend = "software_canvas";
      this.targetFps = 30;
    }
  }

  public getBackend(): RenderBackend {
    return this.backend;
  }

  public getTargetFps(): number {
    return this.targetFps;
  }

  public getViewport(): ViewportState {
    return { ...this.viewport };
  }

  public setPan(xNm: bigint, yNm: bigint): void {
    this.viewport.panXNm = xNm;
    this.viewport.panYNm = yNm;
  }

  public setZoom(factor: number): void {
    if (factor > 0.001 && factor < 1000.0) {
      this.viewport.zoomFactor = factor;
    }
  }

  public handleCrossProbeEvent(event: { type: string; payload: any }): void {
    switch (event.type) {
      case "HighlightNet":
        this.activeNetHighlight = event.payload.netId || null;
        break;
      case "SelectComponent":
        this.activeComponentHighlight = event.payload.componentId || null;
        break;
      case "ClearHighlights":
        this.activeNetHighlight = null;
        this.activeComponentHighlight = null;
        break;
    }
  }

  public getActiveHighlights() {
    return {
      netId: this.activeNetHighlight,
      componentId: this.activeComponentHighlight,
    };
  }

  public transformCoordinatesNmToPixels(xNm: bigint, yNm: bigint, screenWidthPx: number, screenHeightPx: number): [number, number] {
    // 1 mm = 1,000,000 nm. Center is at (screenWidth/2, screenHeight/2)
    const nmPerPx = 100000.0 / this.viewport.zoomFactor; // Base scale: 100 um per pixel at zoom 1.0
    const relX = Number(xNm - this.viewport.panXNm) / nmPerPx;
    const relY = Number(yNm - this.viewport.panYNm) / nmPerPx;

    const screenX = screenWidthPx / 2 + relX;
    const screenY = screenHeightPx / 2 - relY; // Y inverted for standard canvas
    return [screenX, screenY];
  }
}
