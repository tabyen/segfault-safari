// ---- field of view ----------------------------------------------------

// Bresenham line from (x0,y0) to (x1,y1), inclusive.
function bresenham(x0, y0, x1, y1) {
  const pts = [];
  let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  let sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0, y = y0;
  for (;;) {
    pts.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
  return pts;
}

// True if no wall sits strictly between the two points.
function hasLOS(map, x0, y0, x1, y1) {
  const line = bresenham(x0, y0, x1, y1);
  for (let i = 1; i < line.length - 1; i++) {
    const [x, y] = line[i];
    if (map[y][x] === TILE.WALL) return false;
  }
  return true;
}

// Set of "x,y" keys visible from (px,py) within radius.
function computeFOV(map, px, py, radius) {
  const vis = new Set();
  const r2 = (radius + 0.5) * (radius + 0.5);
  for (let y = Math.max(0, py - radius); y <= Math.min(MAP_H - 1, py + radius); y++) {
    for (let x = Math.max(0, px - radius); x <= Math.min(MAP_W - 1, px + radius); x++) {
      const dx = x - px, dy = y - py;
      if (dx * dx + dy * dy > r2) continue;
      if (hasLOS(map, px, py, x, y)) vis.add(x + ',' + y);
    }
  }
  return vis;
}
