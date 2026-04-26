export interface Vec2 {
  x: number;
  y: number;
}

export function vec(x: number, y: number): Vec2 {
  return { x, y };
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
