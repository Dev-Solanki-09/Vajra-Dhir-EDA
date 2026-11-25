export class Color {
  r: number;
  g: number;
  b: number;
  a: number;
  constructor(r: number, g: number, b: number, a?: number);
  static from_css(str: string): Color;
  to_css(): string;
  to_array(): [number, number, number, number];
}

export class Vec2 {
  x: number;
  y: number;
  constructor(x?: number, y?: number);
  copy(): Vec2;
  add(v: Vec2): Vec2;
  sub(v: Vec2): Vec2;
  multiply(s: number): Vec2;
}

export class BBox {
  x: number;
  y: number;
  w: number;
  h: number;
  x2: number;
  y2: number;
  valid: boolean;
  context?: unknown;
  grow(amount: number): BBox;
}

export class Camera2 {
  center: Vec2;
  zoom: number;
  rotation: number;
  bbox: BBox;
  world_to_screen(vec: Vec2): Vec2;
  screen_to_world(vec: Vec2): Vec2;
}

export interface BoardTheme {
  background: Color;
  [key: string]: unknown;
}

export interface SchematicTheme {
  background: Color;
  [key: string]: unknown;
}

export interface Theme {
  name: string;
  friendly_name: string;
  board: BoardTheme;
  schematic: SchematicTheme;
}

export interface FootprintLike {
  uuid?: string;
  reference?: string;
  value?: string;
  locked?: boolean;
  at?: { position: { x: number; y: number }; rotation: number };
  bbox?: BBox;
}

export class KicadPCB {
  footprints: FootprintLike[];
  nets: Array<{ number: number; name: string }>;
  constructor(filename: string, expr: unknown);
  find_footprint(uuid_or_ref: string): FootprintLike | null;
}

export interface SchematicSymbolLike {
  uuid: string;
  reference?: string;
  value?: string;
  lib_id?: string;
  at?: { position: { x: number; y: number }; rotation: number };
}

export class KicadSch {
  symbols: Map<string, SchematicSymbolLike>;
  wires: Array<{ uuid?: string; pts: Vec2[] }>;
  constructor(filename: string, expr: unknown);
  find_symbol(uuid_or_ref: string): SchematicSymbolLike | null;
}

export class Viewport {
  camera: Camera2;
}

export class Renderer {
  update_canvas_size(): void;
}

export class Viewer extends EventTarget {
  renderer: Renderer;
  viewport: Viewport;
  layers?: unknown;
  setup(): Promise<void>;
  draw(): void;
  dispose(): void;
}

export class BoardViewer extends Viewer {
  rendererBackend: 'webgl2' | 'canvas2d';
  forceCanvas2D: boolean;
  track_opacity: number;
  constructor(canvas: HTMLCanvasElement, interactive: boolean, theme: BoardTheme);
  load(src: KicadPCB): Promise<void>;
  select(item: unknown): void;
  highlight_net(net: number): void;
  zoom_to_board(): void;
}

export class SchematicViewer extends Viewer {
  constructor(canvas: HTMLCanvasElement, interactive: boolean, theme: SchematicTheme);
  load(src: KicadSch): Promise<void>;
  select(item: unknown): void;
  zoom_to_page(): void;
}

export const SILICON_DARKROOM_BOARD_THEME: BoardTheme;
export const SILICON_DARKROOM_SCHEMATIC_THEME: SchematicTheme;
export const SILICON_DARKROOM_THEME: Theme;
