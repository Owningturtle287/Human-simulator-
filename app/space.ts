export type Point = { x: number; z: number };
export type Footprint = Point & { width: number; depth: number };
export type PlaceId = 'kitchen' | 'desk' | 'shelf' | 'bed' | 'window' | 'sofa';

export const ROOM = { width: 9.4, depth: 7.6 };
export const PLACES: Record<PlaceId, { label: string; stand: Point; look: Point; surface: number }> = {
  kitchen: { label: 'the kitchen counter', stand: { x: -2.5, z: -2.27 }, look: { x: -2.5, z: -2.88 }, surface: 0.96 },
  desk: { label: 'the desk', stand: { x: -3.05, z: -0.55 }, look: { x: -3.88, z: -0.55 }, surface: 0.78 },
  shelf: { label: 'the bookshelf', stand: { x: 3.1, z: 1.28 }, look: { x: 4.01, z: 1.28 }, surface: 0.98 },
  bed: { label: 'the bed', stand: { x: 1.28, z: -1.82 }, look: { x: 2.05, z: -1.82 }, surface: 0.53 },
  window: { label: 'the window', stand: { x: 0.88, z: -2.78 }, look: { x: 2.56, z: -3.65 }, surface: 0.9 },
  sofa: { label: 'the sofa', stand: { x: -2.78, z: 0.72 }, look: { x: -2.78, z: 1.58 }, surface: 0.51 },
};

export const WATER_SPOTS: PlaceId[] = ['kitchen', 'desk', 'shelf'];
const FURNITURE: Footprint[] = [
  { x: -2.79, z: -3.25, width: 3.52, depth: 0.85 },
  { x: -3.95, z: -0.65, width: 0.89, depth: 1.76 },
  { x: 2.77, z: -2.02, width: 2.20, depth: 2.67 },
  { x: 4.16, z: 1.35, width: 0.62, depth: 1.80 },
  { x: -2.77, z: 1.53, width: 2.60, depth: 1.02 },
  { x: -1.82, z: 2.77, width: 1.35, depth: 0.67 },
  { x: 3.91, z: -2.97, width: 0.48, depth: 0.54 },
];
const SPACING = 0.20;
const X_MIN = -4.38;
const Z_MIN = -3.50;
const COLS = 45;
const ROWS = 36;
const RADIUS = 0.19;
const grid = new Uint8Array(COLS * ROWS);

export function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function free(point: Point) {
  if (Math.abs(point.x) > ROOM.width / 2 - RADIUS || Math.abs(point.z) > ROOM.depth / 2 - RADIUS) return false;
  return !FURNITURE.some(({ x, z, width, depth }) =>
    Math.abs(x - point.x) < width / 2 + RADIUS && Math.abs(z - point.z) < depth / 2 + RADIUS);
}

function at(cell: number): Point {
  return { x: X_MIN + (cell % COLS) * SPACING, z: Z_MIN + Math.floor(cell / COLS) * SPACING };
}

for (let index = 0; index < grid.length; index++) grid[index] = Number(free(at(index)));

function nearest(point: Point) {
  let best = -1;
  let length = Infinity;
  for (let index = 0; index < grid.length; index++) {
    if (!grid[index]) continue;
    const candidate = distance(point, at(index));
    if (candidate < length) {
      best = index;
      length = candidate;
    }
  }
  return best;
}

function clear(a: Point, b: Point) {
  const steps = Math.max(1, Math.ceil(distance(a, b) / (SPACING / 2)));
  for (let step = 1; step <= steps; step++) {
    const ratio = step / steps;
    if (!free({ x: a.x + (b.x - a.x) * ratio, z: a.z + (b.z - a.z) * ratio })) return false;
  }
  return true;
}

export function findPath(start: Point, goal: Point): Point[] {
  if (clear(start, goal)) return [goal];
  const from = nearest(start);
  const to = nearest(goal);
  const open = [from];
  const queued = new Uint8Array(grid.length);
  queued[from] = 1;
  const closed = new Uint8Array(grid.length);
  const cameFrom = new Int32Array(grid.length).fill(-1);
  const scores = new Float32Array(grid.length).fill(Infinity);
  scores[from] = 0;
  const end = at(to);

  while (open.length) {
    let best = 0;
    for (let index = 1; index < open.length; index++) {
      const score = (cell: number) => scores[cell] + distance(at(cell), end);
      if (score(open[index]) < score(open[best])) best = index;
    }
    const current = open[best];
    open[best] = open[open.length - 1];
    open.pop();
    if (current === to) {
      const path = [goal];
      for (let cell = to; cell !== from; cell = cameFrom[cell]) path.push(at(cell));
      path.reverse();
      const smooth: Point[] = [];
      let anchor = start;
      for (let cursor = 0; cursor < path.length; cursor++) {
        while (cursor + 1 < path.length && clear(anchor, path[cursor + 1])) cursor++;
        anchor = path[cursor];
        smooth.push(anchor);
      }
      return smooth;
    }
    queued[current] = 0;
    closed[current] = 1;
    const column = current % COLS;
    const row = Math.floor(current / COLS);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dz) || column + dx < 0 || column + dx >= COLS || row + dz < 0 || row + dz >= ROWS) continue;
        const next = current + dx + dz * COLS;
        if (closed[next] || !grid[next] || (dx && dz && (!grid[current + dx] || !grid[current + dz * COLS]))) continue;
        const candidate = scores[current] + SPACING * Math.hypot(dx, dz);
        if (candidate >= scores[next]) continue;
        scores[next] = candidate;
        cameFrom[next] = current;
        if (!queued[next]) open.push(next);
        queued[next] = 1;
      }
    }
  }
  return [];
}

export function bearing(from: Point, to: Point) {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

export function angleDifference(a: number, b: number) {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}

export function seesWater(atPoint: Point, heading: number, water: PlaceId) {
  // The shelf's tall side panels hide objects until approached from the front.
  const location = PLACES[water].look;
  if (water === 'shelf' && (atPoint.x > 3.5 || Math.abs(atPoint.z - location.z) > 1.5)) return false;
  return distance(atPoint, location) < 3.15 && Math.abs(angleDifference(heading, bearing(atPoint, location))) < 1.08;
}
