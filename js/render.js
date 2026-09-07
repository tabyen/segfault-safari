// ---- rendering --------------------------------------------------------

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const CW = 20, CH = 24;

const stackEl = document.getElementById('stack');
const statsEl = document.getElementById('stats');
const hpFillEl = document.getElementById('hpfill');
const hpTextEl = document.getElementById('hptext');
const logEl = document.getElementById('log');
const overlayEl = document.getElementById('overlay');
const overlayContentEl = document.getElementById('overlay-content');

function glyphAt(x, y, ch, color, alpha) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillText(ch, x * CW + CW / 2, y * CH + CH / 2 + 1);
  ctx.globalAlpha = 1;
}

function render() {
  if (!G) return;

  const p = G.player;
  const vis = computeFOV(G.map, p.x, p.y, p.light);
  for (const key of vis) {
    const [x, y] = key.split(',').map(Number);
    G.explored[y][x] = true;
  }

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = '17px "JetBrains Mono", "Fira Code", Menlo, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const r = p.light + 0.5;
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const t = G.map[y][x];
      const inView = vis.has(x + ',' + y);
      if (!inView && !G.explored[y][x]) continue;
      let ch, color, alpha;
      if (inView) {
        const dx = x - p.x, dy = y - p.y;
        const falloff = Math.sqrt(dx * dx + dy * dy) / r;
        alpha = Math.max(0.45, 1 - 0.55 * falloff * falloff);
        if (t === TILE.WALL) { ch = '#'; color = COLORS.wall; }
        else if (t === TILE.STAIRS) { ch = '>'; color = COLORS.stairs; }
        else { ch = '·'; color = COLORS.floor; }
      } else {
        alpha = 1;
        if (t === TILE.WALL) { ch = '#'; color = COLORS.wallDim; }
        else if (t === TILE.STAIRS) { ch = '>'; color = '#665a3d'; }
        else { ch = '·'; color = COLORS.floorDim; }
      }
      glyphAt(x, y, ch, color, alpha);
    }
  }

  // items: bright in view, remembered dimly on explored tiles
  for (const it of G.items) {
    const t = it.kind === 'weapon' ? WEAPONS[it.widx] : ITEM_TYPES[it.kind];
    if (vis.has(it.x + ',' + it.y)) glyphAt(it.x, it.y, t.glyph, t.color, 1);
    else if (G.explored[it.y][it.x]) glyphAt(it.x, it.y, t.glyph, t.color, 0.3);
  }

  // enemies: only when visible
  for (const e of G.enemies) {
    if (!vis.has(e.x + ',' + e.y)) continue;
    const et = ENEMY_TYPES[e.t];
    if (e.t === 'bug') {
      ctx.shadowColor = et.color;
      ctx.shadowBlur = 12;
    }
    glyphAt(e.x, e.y, et.glyph, et.color, 1);
    ctx.shadowBlur = 0;
  }

  // player
  ctx.shadowColor = COLORS.player;
  ctx.shadowBlur = 10;
  glyphAt(p.x, p.y, '@', COLORS.player, 1);
  ctx.shadowBlur = 0;

  renderStack();
  renderStats();
  renderLog();
  renderOverlay();
  if (typeof syncTouchPad === 'function') syncTouchPad();
}

function renderStack() {
  let html = '';
  for (let i = 0; i < CALL_STACK.length; i++) {
    const f = CALL_STACK[i];
    if (i <= G.maxDepth) {
      const cls = i === G.depth ? 'current' : 'visited';
      const arrow = i === G.depth ? '▶ ' : '&nbsp;&nbsp;';
      html += `<li class="${cls}">${arrow}at <span class="fn">${f.fn}</span> (${f.file}:${f.line})</li>`;
    } else {
      html += `<li class="unknown">&nbsp;&nbsp;at ??? (?:?)</li>`;
    }
  }
  stackEl.innerHTML = html;
}

function renderStats() {
  const p = G.player;
  const pct = Math.max(0, p.hp / p.maxhp);
  hpFillEl.style.width = (pct * 100) + '%';
  hpFillEl.style.background = pct > 0.5 ? 'var(--green)' : pct > 0.25 ? 'var(--yellow)' : 'var(--red)';
  hpTextEl.textContent = Math.max(0, p.hp) + '/' + p.maxhp;
  const bp = G.checkpoint
    ? `<span class="bp-set">● frame ${G.checkpoint.depth}</span>`
    : '<span class="dim">none</span>';
  const dmg = (p.weapon.min + p.dmgBonus) + '–' + (p.weapon.max + p.dmgBonus);
  statsEl.innerHTML =
    `<span style="grid-column: span 2">lvl ${p.lvl} <span class="sv">${playerTitle()}</span>` +
    ` <span class="dim">(xp ${p.xp}/${xpToNext(p.lvl)})</span></span>` +
    `<span style="grid-column: span 2">wields <span class="sv">${p.weapon.name}</span> (${dmg})</span>` +
    `<span>frame <span class="sv">#${G.depth}</span>/${MAX_DEPTH}</span>` +
    `<span>defense <span class="sv">${p.def}</span></span>` +
    `<span>sight <span class="sv">${p.light}</span></span>` +
    `<span>squashed <span class="sv">${G.kills}</span></span>` +
    `<span>turns <span class="sv">${G.turns}</span></span>` +
    `<span>breakpoint ${bp}</span>`;
}

function renderLog() {
  logEl.innerHTML = G.log
    .slice(-40)
    .map(m => `<div class="msg-${m.cls}">${m.text}</div>`)
    .join('');
  logEl.scrollTop = logEl.scrollHeight;
}

// ---- overlays ---------------------------------------------------------

function legendHTML() {
  return `<div class="legend">
    <span class="g" style="color:${COLORS.player}">@</span><span>you, the debugger</span>
    <span class="g" style="color:${ENEMY_TYPES.npe.color}">∅ ± ∞ ϟ H X Ø K</span><span>exceptions — bump into them to attack</span>
    <span class="g" style="color:${WEAPONS[3].color}">- / \\ | ¶ ‡</span><span>weapons — better debug tools hit harder</span>
    <span class="g" style="color:${ITEM_TYPES.print.color}">"</span><span>print statement — lights your way (+1 sight)</span>
    <span class="g" style="color:${ITEM_TYPES.bp.color}">●</span><span>breakpoint — checkpoint; crashing resumes here</span>
    <span class="g" style="color:${ITEM_TYPES.coffee.color}">+</span><span>coffee — restores HP</span>
    <span class="g" style="color:${ITEM_TYPES.patch.color}">† [</span><span>hotfix patch (+atk), try/catch block (+def)</span>
    <span class="g" style="color:${COLORS.stairs}">&gt;</span><span>step into the next stack frame</span>
  </div>`;
}

function titleHTML() {
  return `
    <h1>SEGFAULT <span class="glitch">SAFARI</span></h1>
    <div class="sub">a stack trace dungeon crawler</div>
    <p class="story">A wild <b>SIGSEGV</b> appeared in production.<br>
    Descend the call stack, frame by frame, to the root cause — and squash <b>THE BUG</b>.</p>
    ${legendHTML()}
    <div class="press">[ press any key to attach debugger ]</div>
    <div class="press touch-hint">[ tap to attach debugger ]</div>`;
}

function deadHTML() {
  return `
    <h1 class="crash">CORE DUMPED</h1>
    <div class="sub">process terminated with signal 11</div>
    <p>${playerTitle()}, lvl ${G.player.lvl}, crashed in <b>${CALL_STACK[G.depth].fn}()</b> —
    frame #${G.depth} of ${MAX_DEPTH}, after ${G.turns} turns and ${G.kills} squashed exceptions.</p>
    <p class="dim">Tip: breakpoints ● only catch one crash each. Save them for when things get hairy.</p>
    <div class="press">[ press R to re-run the process ]</div>
    <div class="press touch-hint">[ tap to re-run the process ]</div>`;
}

function wonHTML() {
  return `
    <h1>BUG FIXED</h1>
    <div class="sub">root cause: double free in kernel/mm.c:404</div>
<pre>
<span class="ctx">@@ kernel/mm.c:404 @@</span>
<span class="del">-    free(page);              // freed here...</span>
<span class="del">-    flush_tlb(page);</span>
<span class="del">-    free(page);              // ...and freed again. THE BUG.</span>
<span class="add">+    free(page);</span>
<span class="add">+    flush_tlb(page);</span>
<span class="add">+    page = NULL;             // never again</span>
</pre>
    <p>The stack unwinds cleanly, all ${CALL_STACK.length} frames of it.
    Production is green. Nobody will ever know.</p>
    <p>${G.turns} turns · ${G.kills} exceptions squashed · retired a lvl ${G.player.lvl} ${playerTitle()}</p>
    <div class="press">[ press R to chase another bug ]</div>
    <div class="press touch-hint">[ tap to chase another bug ]</div>`;
}

function helpHTML() {
  return `
    <h1 style="font-size:1.3rem">MANUAL PAGE</h1>
    <div class="helpgrid">
      <span class="kk">←↑↓→ / wasd / hjkl</span><span>move — bump into an exception to attack it</span>
      <span class="kk">space / .</span><span>wait one turn</span>
      <span class="kk">R</span><span>restart</span>
      <span class="kk">?</span><span>toggle this help</span>
    </div>
    ${legendHTML()}
    <p class="dim">Each level is one stack frame. The <span class="k-stairs">&gt;</span> steps into
    the next call. There is no going back up until the bug is fixed.</p>
    <div class="press">[ press ? to close ]</div>
    <div class="press touch-hint">[ tap to close ]</div>`;
}

function renderOverlay() {
  let html = null;
  if (helpOpen) html = helpHTML();
  else if (!G) html = titleHTML();
  else if (G.status === 'dead') html = deadHTML();
  else if (G.status === 'won') html = wonHTML();
  if (html !== null) {
    overlayContentEl.innerHTML = html;
    overlayEl.classList.remove('hidden');
  } else {
    overlayEl.classList.add('hidden');
  }
}
