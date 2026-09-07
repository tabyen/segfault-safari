// ---- input & boot -----------------------------------------------------

let helpOpen = false;

const MOVE_KEYS = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
  k: [0, -1], j: [0, 1], h: [-1, 0], l: [1, 0],
};

document.addEventListener('keydown', (ev) => {
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
  const key = ev.key;

  if (key === '?') {
    ev.preventDefault();
    helpOpen = !helpOpen;
    renderOverlay();
    return;
  }
  if (helpOpen) {
    ev.preventDefault();
    helpOpen = false;
    renderOverlay();
    return;
  }

  // title screen: any key starts
  if (!G) {
    ev.preventDefault();
    newGame(Date.now());
    return;
  }

  if (key === 'r' || key === 'R') {
    ev.preventDefault();
    newGame(Date.now());
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
