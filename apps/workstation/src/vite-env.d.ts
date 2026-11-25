/// <reference types="vite/client" />

declare module 'occt-import-js' {
  export interface OcctMesh {
    name?: string;
    color?: [number, number, number];
    attributes: {
      position: { array: number[] | Float32Array };
      normal?: { array: number[] | Float32Array };
    };
    index?: { array: number[] | Uint32Array | Uint16Array };
  }
  export interface OcctResult {
    success: boolean;
    meshes: OcctMesh[];
  }
  export interface OcctModule {
    ReadStepFile(content: Uint8Array, params?: Record<string, unknown> | null): OcctResult;
    ReadIgesFile?(content: Uint8Array, params?: Record<string, unknown> | null): OcctResult;
  }
  export default function occtimportjs(moduleOverrides?: {
    locateFile?: (path: string) => string;
  }): Promise<OcctModule>;
}
