// ---- level generation -------------------------------------------------
// Uses the seeded rng from game.js (rnd / ri / choice).

function roomCenter(r) {
  return [Math.floor(r.x + r.w / 2), Math.floor(r.y + r.h / 2)];
}

function carveRoom(map, r) {
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++)
      map[y][x] = TILE.FLOOR;
}

function carveCorridor(map, x0, y0, x1, y1) {
  // L-shaped, random elbow order
  const horizFirst = rnd() < 0.5;
  let x = x0, y = y0;
  if (horizFirst) {
    while (x !== x1) { map[y][x] = TILE.FLOOR; x += Math.sign(x1 - x); }
    while (y !== y1) { map[y][x] = TILE.FLOOR; y += Math.sign(y1 - y); }
  } else {
    while (y !== y1) { map[y][x] = TILE.FLOOR; y += Math.sign(y1 - y); }
    while (x !== x1) { map[y][x] = TILE.FLOOR; x += Math.sign(x1 - x); }
  }
  map[y][x] = TILE.FLOOR;
}

function generateLevel(depth) {
  const map = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(TILE.WALL));
  const isBossLevel = depth === MAX_DEPTH;

  if (isBossLevel) {
    // one big arena with pillars
    const arena = { x: 3, y: 3, w: MAP_W - 6, h: MAP_H - 6 };
    carveRoom(map, arena);
    for (let i = 0; i < 14; i++) {
      const px = ri(arena.x + 2, arena.x + arena.w - 3);
      const py = ri(arena.y + 2, arena.y + arena.h - 3);
      // keep the entrance and lair corners clear
      if (px < arena.x + 6 || px > arena.x + arena.w - 7) continue;
      map[py][px] = TILE.WALL;
    }
    const start = [arena.x + 1, Math.floor(MAP_H / 2)];
    return { map, rooms: [arena], start, stairs: null };
  }

  // rooms + corridors
  const rooms = [];
  for (let i = 0; i < 90 && rooms.length < 9; i++) {
    const w = ri(4, 9), h = ri(3, 6);
    const x = ri(1, MAP_W - w - 2), y = ri(1, MAP_H - h - 2);
    const r = { x, y, w, h };
    const overlaps = rooms.some(o =>
      x <= o.x + o.w && o.x <= x + w && y <= o.y + o.h && o.y <= y + h);
    if (overlaps) continue;
    carveRoom(map, r);
    rooms.push(r);
  }
  for (let i = 1; i < rooms.length; i++) {
    const [ax, ay] = roomCenter(rooms[i - 1]);
    const [bx, by] = roomCenter(rooms[i]);
    carveCorridor(map, ax, ay, bx, by);
  }

  const start = roomCenter(rooms[0]);
  // stairs go in the room farthest from the start
  let best = rooms[0], bestDist = -1;
  for (const r of rooms) {
    const [cx, cy] = roomCenter(r);
    const d = Math.abs(cx - start[0]) + Math.abs(cy - start[1]);
    if (d > bestDist) { bestDist = d; best = r; }
  }
  const stairs = roomCenter(best);
  map[stairs[1]][stairs[0]] = TILE.STAIRS;

  return { map, rooms, start, stairs };
}

// Random free floor tile inside any room except the first (the start room).
// `taken` is a Set of "x,y" keys already occupied.
function randomSpawnTile(level, taken) {
  const rooms = level.rooms.length > 1 ? level.rooms.slice(1) : level.rooms;
  for (let tries = 0; tries < 200; tries++) {
    const r = choice(rooms);
    const x = ri(r.x, r.x + r.w - 1);
    const y = ri(r.y, r.y + r.h - 1);
    const key = x + ',' + y;
    if (level.map[y][x] !== TILE.FLOOR) continue;
    if (taken.has(key)) continue;
    if (x === level.start[0] && y === level.start[1]) continue;
    taken.add(key);
    return [x, y];
  }
  return null;
}
