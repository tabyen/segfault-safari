// ---- input & boot -----------------------------------------------------

let helpOpen = false;

const MOVE_KEYS = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
  k: [0, -1], j: [0, 1], h: [-1, 0], l: [1, 0],
};

const TOUCH = window.matchMedia('(pointer: coarse)').matches;
const touchPad = document.getElementById('touch-pad');

function syncTouchPad() {
  if (!touchPad) return;
  const show = TOUCH && G && G.status === 'playing' && !helpOpen;
  touchPad.hidden = !show;
}

function canvasToTile(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const x = Math.floor(((clientX - rect.left) / rect.width) * MAP_W);
  const y = Math.floor(((clientY - rect.top) / rect.height) * MAP_H);
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return null;
  return [x, y];
}

function tapMoveToward(tx, ty) {
  if (!G || G.status !== 'playing') return;
  const p = G.player;
  let dx = Math.sign(tx - p.x);
  let dy = Math.sign(ty - p.y);
  if (dx === 0 && dy === 0) {
    playerAct(0, 0);
    return;
  }
  if (dx && dy) {
    if (Math.abs(tx - p.x) >= Math.abs(ty - p.y)) dy = 0;
    else dx = 0;
  }
  playerAct(dx, dy);
}

overlayEl.addEventListener('pointerdown', (ev) => {
  if (ev.target.closest('a')) return;
  ev.preventDefault();
  if (helpOpen) {
    helpOpen = false;
    renderOverlay();
    syncTouchPad();
    return;
  }
  if (!G || G.status === 'dead' || G.status === 'won') {
    newGame(Date.now());
    syncTouchPad();
  }
});

canvas.addEventListener('pointerdown', (ev) => {
  if (ev.pointerType === 'mouse' && ev.button !== 0) return;
  if (!G || G.status !== 'playing' || helpOpen) return;
  const tile = canvasToTile(ev.clientX, ev.clientY);
  if (!tile) return;
  ev.preventDefault();
  tapMoveToward(tile[0], tile[1]);
});

touchPad?.addEventListener('pointerdown', (ev) => {
  const btn = ev.target.closest('button');
  if (!btn) return;
  ev.preventDefault();
  if (btn.dataset.act === 'wait') playerAct(0, 0);
  else if (btn.dataset.move) {
    const [dx, dy] = btn.dataset.move.split(',').map(Number);
    playerAct(dx, dy);
  }
});

document.addEventListener('keydown', (ev) => {
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
  const key = ev.key;

  if (key === '?') {
    ev.preventDefault();
    helpOpen = !helpOpen;
    renderOverlay();
    syncTouchPad();
    return;
  }
  if (helpOpen) {
    ev.preventDefault();
    helpOpen = false;
    renderOverlay();
    syncTouchPad();
    return;
  }

  // title screen: any key starts
  if (!G) {
    ev.preventDefault();
    newGame(Date.now());
    syncTouchPad();
    return;
  }

  if (key === 'r' || key === 'R') {
    ev.preventDefault();
    newGame(Date.now());
    syncTouchPad();
    return;
  }

  if (G.status !== 'playing') return;

  if (key in MOVE_KEYS) {
    ev.preventDefault();
    const [dx, dy] = MOVE_KEYS[key];
    playerAct(dx, dy);
  } else if (key === ' ' || key === '.') {
    ev.preventDefault();
    playerAct(0, 0); // wait
  }
});

// boot: show title screen (or jump straight in with ?autostart[&seed=N])
const params = new URLSearchParams(location.search);
if (params.has('autostart')) {
  newGame(Number(params.get('seed')) || Date.now());
  const depth = Math.min(Number(params.get('depth')) || 0, MAX_DEPTH);
  if (depth > 0) { startLevel(depth); render(); }
} else {
  renderOverlay();
}
syncTouchPad();
