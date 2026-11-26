declare module 'unist' {
  export interface Point {
    line: number;
    column: number;
    offset?: number;
  }

  export interface Position {
    start: Point;
    end: Point;
  }

  export interface Node {
    type: string;
    position?: Position;
  }

  export interface Parent extends Node {
    children: Node[];
  }
}
