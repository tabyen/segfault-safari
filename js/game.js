// ---- game state & rules -----------------------------------------------

let G = null; // whole game state; plain data only, so structuredClone works

// seeded rng (mulberry32 stepped on G.rngState)
function rnd() {
  G.rngState = (G.rngState + 0x6D2B79F5) | 0;
  let t = G.rngState;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function ri(a, b) { return a + Math.floor(rnd() * (b - a + 1)); }
function choice(arr) { return arr[Math.floor(rnd() * arr.length)]; }

function addLog(text, cls) {
  G.log.push({ text, cls: cls || 'info' });
  if (G.log.length > 100) G.log.splice(0, G.log.length - 100);
}

function enemyAt(x, y) {
  return G.enemies.find(e => e.x === x && e.y === y) || null;
}
function itemIndexAt(x, y) {
  return G.items.findIndex(it => it.x === x && it.y === y);
}
function isWalkable(x, y) {
  return x >= 0 && y >= 0 && x < MAP_W && y < MAP_H && G.map[y][x] !== TILE.WALL;
}

// ---- setup ------------------------------------------------------------

function newGame(seed) {
  G = {
    rngState: seed | 0,
    status: 'playing',
    depth: 0,
    maxDepth: 0,
    turns: 0,
    kills: 0,
    nextId: 1,
    map: null,
    explored: null,
    items: [],
    enemies: [],
    player: {
      x: 0, y: 0, hp: 24, maxhp: 24, def: 0, light: 3,
      weapon: { ...STARTING_WEAPON }, dmgBonus: 0, lvl: 1, xp: 0,
    },
    log: [],
    checkpoint: null,
  };
  addLog('⚠ Unhandled SIGSEGV in production.', 'hurt');
  addLog('The trace goes ' + CALL_STACK.length + ' frames deep. Find the root cause.', 'info');
  startLevel(0);
  render();
}

function spawnEnemy(type, x, y) {
  const et = ENEMY_TYPES[type];
  // exceptions get meaner the deeper the frame
  const hpBonus = type === 'bug' ? 0 : Math.floor(G.depth / 2);
  const atkBonus = ['leaklet', 'uaf'].includes(type) ? 0
    : (G.depth >= 4 ? 1 : 0) + (G.depth >= 7 ? 1 : 0);
  G.enemies.push({
    id: G.nextId++, t: type, x, y,
    hp: et.hp + hpBonus, atk: et.atk + atkBonus,
    aware: false, tick: 0, cool: 0, dir: ri(0, 3),
  });
}

function startLevel(depth) {
  G.depth = depth;
  G.maxDepth = Math.max(G.maxDepth, depth);
  const lvl = generateLevel(depth);
  G.map = lvl.map;
  G.explored = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(false));
  G.items = [];
  G.enemies = [];
  G.player.x = lvl.start[0];
  G.player.y = lvl.start[1];

  const taken = new Set();
  const place = (kind) => {
    const pos = randomSpawnTile(lvl, taken);
    if (pos) G.items.push({ kind, x: pos[0], y: pos[1] });
  };

  if (depth === MAX_DEPTH) {
    // boss lair; clear the tile first in case a pillar landed there
    const bx = MAP_W - 6, by = Math.floor(MAP_H / 2);
    const spawnClear = (type, x, y) => {
      G.map[y][x] = TILE.FLOOR;
      spawnEnemy(type, x, y);
    };
    spawnClear('bug', bx, by);
    spawnClear('panic', bx - 3, by);
    spawnClear('segv', Math.floor(MAP_W / 2), by - 5);
    spawnClear('race', Math.floor(MAP_W / 2), by + 5);
    place('coffee'); place('coffee'); place('coffee');
    place('patch'); place('print'); place('bp');
  } else {
    const pool = Object.keys(ENEMY_TYPES)
      .filter(k => depth >= ENEMY_TYPES[k].minD && depth <= ENEMY_TYPES[k].maxD);
    const count = Math.min(5 + depth, 12);
    for (let i = 0; i < count; i++) {
      const pos = randomSpawnTile(lvl, taken);
      if (pos) spawnEnemy(choice(pool), pos[0], pos[1]);
    }
    place('print');
    if (depth < 2) place('print');
    place('coffee');
    if (depth >= 4) place('coffee');
    if (depth >= 2 && depth % 2 === 0) place('bp'); // breakpoints are scarce
    if (depth >= 1) placeWeapon(lvl, taken, depth);
    if (depth === 2 || depth === 5) place('patch');
    if (depth === 3 || depth === 6) place('catch');
  }

  const f = CALL_STACK[depth];
  addLog('→ Stepping into ' + f.fn + '() — ' + f.file + ':' + f.line, 'frame');
  addLog(f.blurb, 'flavor');
}

// weapon tier tracks depth, with a little wobble upward
function placeWeapon(lvl, taken, depth) {
  const widx = Math.min(WEAPONS.length - 1, Math.max(0, depth - 1 + ri(0, 1)));
  const pos = randomSpawnTile(lvl, taken);
  if (pos) G.items.push({ kind: 'weapon', widx, x: pos[0], y: pos[1] });
}

// ---- advancement ------------------------------------------------------

function playerTitle() {
  return LEVEL_TITLES[Math.min(G.player.lvl - 1, LEVEL_TITLES.length - 1)];
}

function gainXP(n) {
  const p = G.player;
  p.xp += n;
  while (p.xp >= xpToNext(p.lvl)) {
    p.xp -= xpToNext(p.lvl);
    p.lvl++;
    p.maxhp += 3;
    p.hp = Math.min(p.maxhp, p.hp + 3);
    if (p.lvl % 2 === 0) p.dmgBonus++;
    addLog('▲ Promoted: ' + playerTitle() + '! (+3 max HP' +
      (p.lvl % 2 === 0 ? ', +1 damage' : '') + ')', 'good');
  }
}

// ---- player actions ---------------------------------------------------

function playerAct(dx, dy) {
  if (!G || G.status !== 'playing') return;

  if (dx !== 0 || dy !== 0) {
    const nx = G.player.x + dx, ny = G.player.y + dy;
    const target = enemyAt(nx, ny);
    if (target) {
      attackEnemy(target);
    } else if (isWalkable(nx, ny)) {
      G.player.x = nx;
      G.player.y = ny;
      pickupHere();
      if (G.status !== 'playing') { render(); return; } // won via pickup? (safety)
      if (G.map[ny][nx] === TILE.STAIRS) {
        G.turns++;
        startLevel(G.depth + 1);
        render();
        return; // fresh frame: enemies don't get a free hit
      }
    } else {
      return; // bumped a wall: no turn passes
    }
  }
  // else: explicit wait

  G.turns++;
  enemyTurns();
  checkPlayerDeath();
  render();
}

function attackEnemy(e) {
  const et = ENEMY_TYPES[e.t];
  const p = G.player;
  const dmg = ri(p.weapon.min, p.weapon.max) + p.dmgBonus;
  e.hp -= dmg;
  if (e.hp <= 0) {
    G.enemies = G.enemies.filter(x => x.id !== e.id);
    G.kills++;
    addLog(et.die, 'good');
    if (e.t === 'dbl') {
      // a mishandled DoubleFree leaves dangling references behind
      spawnAdjacent(e, 'uaf');
      spawnAdjacent(e, 'uaf');
    }
    gainXP(et.xp);
    if (e.t === 'bug') {
      G.status = 'won';
      addLog('Root cause found: double free at kernel/mm.c:404.', 'frame');
      addLog('You write the patch. The stack unwinds.', 'good');
    }
  } else {
    addLog('You hit the ' + et.name + ' for ' + dmg + '.', 'combat');
    if (e.t === 'heis') heisenbugBlink(e);
  }
}

// a Heisenbug that survives being hit is suddenly somewhere else
function heisenbugBlink(e) {
  for (let tries = 0; tries < 30; tries++) {
    const nx = e.x + ri(-5, 5), ny = e.y + ri(-5, 5);
    if (!isWalkable(nx, ny) || enemyAt(nx, ny)) continue;
    if (nx === G.player.x && ny === G.player.y) continue;
    if (Math.abs(nx - e.x) + Math.abs(ny - e.y) < 2) continue;
    e.x = nx; e.y = ny;
    addLog('The Heisenbug is somewhere else when you look.', 'flavor');
    return;
  }
}

function pickupHere() {
  const i = itemIndexAt(G.player.x, G.player.y);
  if (i < 0) return;
  const it = G.items[i];
  G.items.splice(i, 1);
  const p = G.player;
  switch (it.kind) {
    case 'print':
      p.light = Math.min(8, p.light + 1);
      addLog(choice(PRINT_LINES), 'item');
      addLog('The print statement sheds light. (sight +1)', 'good');
      break;
    case 'coffee': {
      const heal = Math.min(5, p.maxhp - p.hp);
      p.hp += heal;
      addLog('Coffee. Restores ' + heal + ' HP.', 'good');
      break;
    }
    case 'patch':
      p.dmgBonus += 1;
      addLog('You apply a hotfix patch. (damage +1)', 'good');
      break;
    case 'weapon': {
      const w = WEAPONS[it.widx];
      const better = w.min + w.max > p.weapon.min + p.weapon.max;
      if (better) {
        addLog('You pick up the ' + w.name + ' (' + w.min + '–' + w.max +
          '), dropping your ' + p.weapon.name + '.', 'good');
        p.weapon = { name: w.name, min: w.min, max: w.max };
      } else {
        addLog('A ' + w.name + ' (' + w.min + '–' + w.max + '). Your ' +
          p.weapon.name + ' is better; you leave it.', 'dim');
        G.items.push(it); // put it back
      }
      break;
    }
    case 'catch':
      p.def += 1;
      addLog('You wrap yourself in a try/catch block. (defense +1)', 'good');
      break;
    case 'bp':
      saveCheckpoint();
      addLog('● Breakpoint set in ' + CALL_STACK[G.depth].fn + '(). Execution will resume here if you crash.', 'item');
      break;
  }
}

// ---- checkpoints ------------------------------------------------------

function saveCheckpoint() {
  const cp = G.checkpoint;
  G.checkpoint = null;
  const snap = structuredClone(G);
  G.checkpoint = snap;
  void cp;
}

function restoreCheckpoint() {
  const cp = G.checkpoint;
  G = structuredClone(cp);
  G.checkpoint = null; // breakpoints are single-use: this one just fired
  // crashing hurts, but the debugger is merciful
  G.player.hp = Math.max(G.player.hp, Math.ceil(G.player.maxhp * 0.6));
  addLog('✂ SIGSEGV caught by debugger!', 'hurt');
  addLog('● Breakpoint hit — frame state restored. The breakpoint burns out.', 'item');
}

function checkPlayerDeath() {
  if (G.player.hp > 0) return;
  if (G.checkpoint) {
    restoreCheckpoint();
  } else {
    G.status = 'dead';
    addLog('Segmentation fault (core dumped)', 'hurt');
  }
}

// ---- enemy turns ------------------------------------------------------

// BFS distance map from the player, for enemy pathfinding.
function distMap() {
  const d = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(Infinity));
  const q = [[G.player.x, G.player.y]];
  d[G.player.y][G.player.x] = 0;
  let head = 0;
  while (head < q.length) {
    const [x, y] = q[head++];
    const nd = d[y][x] + 1;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!isWalkable(nx, ny) || d[ny][nx] <= nd) continue;
      d[ny][nx] = nd;
      q.push([nx, ny]);
    }
  }
  return d;
}

function tryMoveEnemy(e, nx, ny) {
  if (!isWalkable(nx, ny)) return false;
  if (nx === G.player.x && ny === G.player.y) return false;
  if (enemyAt(nx, ny)) return false;
  e.x = nx; e.y = ny;
  return true;
}

function stepTowardPlayer(e, d) {
  const opts = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = e.x + dx, ny = e.y + dy;
    if (!isWalkable(nx, ny) || enemyAt(nx, ny)) continue;
    if (nx === G.player.x && ny === G.player.y) continue;
    opts.push([d[ny][nx], nx, ny]);
  }
  if (!opts.length) return;
  opts.sort((a, b) => a[0] - b[0]);
  const bestDist = opts[0][0];
  if (bestDist >= d[e.y][e.x]) return; // no closer tile; hold position
  const best = opts.filter(o => o[0] === bestDist);
  const [, nx, ny] = choice(best);
  e.x = nx; e.y = ny;
}

function patrol(e) {
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  for (let i = 0; i < 4; i++) {
    const [dx, dy] = DIRS[e.dir];
    if (tryMoveEnemy(e, e.x + dx, e.y + dy)) return;
    e.dir = (e.dir + 1) % 4;
  }
}

function enemyAttack(e) {
  const et = ENEMY_TYPES[e.t];
  if (e.t === 'ob1' && rnd() < 0.3) {
    addLog('The OffByOneError misses you by exactly one.', 'dim');
    return;
  }
  const dmg = Math.max(1, e.atk - G.player.def);
  G.player.hp -= dmg;
  addLog('The ' + et.name + ' ' + et.hit + ' for ' + dmg + '!', 'hurt');
}

function adjacentToPlayer(e) {
  return Math.abs(e.x - G.player.x) + Math.abs(e.y - G.player.y) === 1;
}

function spawnAdjacent(e, type) {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = e.x + dx, ny = e.y + dy;
    if (isWalkable(nx, ny) && !enemyAt(nx, ny) &&
        !(nx === G.player.x && ny === G.player.y)) {
      spawnEnemy(type, nx, ny);
      return true;
    }
  }
  return false;
}

function enemyTurns() {
  const d = distMap();
  const p = G.player;

  for (const e of [...G.enemies]) {
    if (!G.enemies.includes(e)) continue; // safety, list can change
    const et = ENEMY_TYPES[e.t];
    e.tick++;

    // wake up when close enough with line of sight
    const dist = Math.abs(e.x - p.x) + Math.abs(e.y - p.y);
    if (!e.aware && dist <= 9 && hasLOS(G.map, e.x, e.y, p.x, p.y)) {
      e.aware = true;
    }

    // SegmentationFaults and KernelPanics are heavy: they act every other turn
    if ((e.t === 'segv' || e.t === 'panic') && e.tick % 2 === 0) continue;

    // spawners
    if (e.t === 'leak' && e.aware) {
      e.cool++;
      const leaklets = G.enemies.filter(x => x.t === 'leaklet').length;
      if (e.cool >= 5 && leaklets < 5 && spawnAdjacent(e, 'leaklet')) {
        e.cool = 0;
        addLog('The MemoryLeak leaks another allocation.', 'dim');
      }
    }
    if (e.t === 'bug') {
      e.cool++;
      const minions = G.enemies.filter(x => x.t === 'npe').length;
      if (e.cool >= 6 && minions < 3 && spawnAdjacent(e, 'npe')) {
        e.cool = 0;
        addLog('THE BUG dereferences the void — a NullPointerException crawls out!', 'hurt');
      }
    }

    // RaceConditions sometimes act twice
    const actions = e.t === 'race' && rnd() < 0.5 ? 2 : 1;
    let attacked = false;
    for (let a = 0; a < actions && !attacked; a++) {
      if (adjacentToPlayer(e)) {
        enemyAttack(e);
        attacked = true;
      } else if (e.aware) {
        if (e.t === 'loop' && d[e.y][e.x] > 5) {
          patrol(e); // infinite loops stay in their loop until you get close
        } else if (e.t === 'ob1' && rnd() < 0.2) {
          const [dx, dy] = choice([[1, 0], [-1, 0], [0, 1], [0, -1]]);
          tryMoveEnemy(e, e.x + dx, e.y + dy); // wanders off by one
        } else {
          stepTowardPlayer(e, d);
        }
      } else if (e.t === 'loop') {
        patrol(e);
      } else if (rnd() < 0.25) {
        const [dx, dy] = choice([[1, 0], [-1, 0], [0, 1], [0, -1]]);
        tryMoveEnemy(e, e.x + dx, e.y + dy);
      }
    }
  }
}
