// ---- static game data -------------------------------------------------

const MAP_W = 42;
const MAP_H = 24;

const TILE = { WALL: '#', FLOOR: '.', STAIRS: '>' };

// The call stack you descend. Index = depth. Last frame holds the root cause.
const CALL_STACK = [
  { fn: 'main',          file: 'app.js',         line: 1,      blurb: 'Ship it, they said. It compiled, they said.' },
  { fn: 'startServer',   file: 'server.js',      line: 23,     blurb: 'Somewhere far below, a request went terribly wrong.' },
  { fn: 'handleRequest', file: 'router.js',      line: 117,    blurb: 'The middleware stack thickens.' },
  { fn: 'parseBody',     file: 'middleware.js',  line: 88,     blurb: 'Unsanitized input drips from the ceiling.' },
  { fn: 'deserialize',   file: 'json-fast.js',   line: 412,    blurb: 'A dependency of a dependency. Last published seven years ago.' },
  { fn: 'allocBuffer',   file: 'node_buffer.cc', line: 1337,   blurb: 'You have left userland. The pointers are real down here.' },
  { fn: 'memcpy_impl',   file: 'libc.so',        line: '0x7f3a', blurb: 'Ancient C hums in the dark. Here be dragons.' },
  { fn: 'page_fault',    file: 'kernel/mm.c',    line: 404,    blurb: 'The root cause lairs here. You can hear it skittering.' },
];
const MAX_DEPTH = CALL_STACK.length - 1;

// ---- enemies ----------------------------------------------------------
// minD/maxD: depth range where this exception spawns. xp: awarded on kill.
const ENEMY_TYPES = {
  npe: {
    name: 'NullPointerException', glyph: '∅', color: '#f07178',
    hp: 3, atk: 1, xp: 2, minD: 0, maxD: 4,
    hit: 'dereferences you', die: 'You squash the NullPointerException. It was nothing all along.',
  },
  ob1: {
    name: 'OffByOneError', glyph: '±', color: '#ffa759',
    hp: 2, atk: 1, xp: 2, minD: 0, maxD: 4,
    hit: 'fenceposts you', die: 'The OffByOneError is off by one final one.',
  },
  loop: {
    name: 'InfiniteLoop', glyph: '∞', color: '#d4bfff',
    hp: 4, atk: 1, xp: 3, minD: 1, maxD: 5,
    hit: 'spins you around', die: 'The InfiniteLoop finally terminates.',
  },
  race: {
    name: 'RaceCondition', glyph: 'ϟ', color: '#73d0ff',
    hp: 3, atk: 2, xp: 4, minD: 2, maxD: 6,
    hit: 'preempts you', die: 'The RaceCondition loses the race.',
  },
  leak: {
    name: 'MemoryLeak', glyph: '≈', color: '#95e6cb',
    hp: 5, atk: 1, xp: 5, minD: 3, maxD: 6,
    hit: 'oozes on you', die: 'The MemoryLeak is finally freed.',
  },
  leaklet: {
    name: 'leaked allocation', glyph: '~', color: '#95e6cb',
    hp: 1, atk: 1, xp: 1, minD: 99, maxD: -1, // never spawns naturally
    hit: 'drips on you', die: 'The leaked allocation is collected.',
  },
  heis: {
    name: 'Heisenbug', glyph: 'H', color: '#d4bfff',
    hp: 4, atk: 2, xp: 6, minD: 4, maxD: 7,
    hit: 'glitches through you', die: 'The Heisenbug is finally observed. It does not survive observation.',
  },
  segv: {
    name: 'SegmentationFault', glyph: 'X', color: '#f07178',
    hp: 7, atk: 3, xp: 7, minD: 4, maxD: 7,
    hit: 'violates your access', die: 'The SegmentationFault faults for the last time.',
  },
  dbl: {
    name: 'DoubleFree', glyph: 'Ø', color: '#ffa759',
    hp: 8, atk: 3, xp: 8, minD: 5, maxD: 7,
    hit: 'frees you twice', die: 'The DoubleFree comes apart — its dangling references scatter!',
  },
  uaf: {
    name: 'UseAfterFree', glyph: 'u', color: '#ffa759',
    hp: 2, atk: 2, xp: 2, minD: 99, maxD: -1, // only from a DoubleFree's death
    hit: 'claws at you from beyond the heap', die: 'The UseAfterFree is finally, properly freed.',
  },
  panic: {
    name: 'KernelPanic', glyph: 'K', color: '#ff3333',
    hp: 10, atk: 4, xp: 10, minD: 6, maxD: 7,
    hit: 'oopses all over you', die: 'The KernelPanic calms down.',
  },
  bug: {
    name: 'THE BUG (dangling pointer)', glyph: 'Ж', color: '#ff3333',
    hp: 30, atk: 4, xp: 30, minD: 99, maxD: -1,
    hit: 'writes through freed memory into you', die: 'THE BUG has been squashed.',
  },
};

// ---- weapons ----------------------------------------------------------
// Damage is a ri(min,max) roll plus the player's flat bonus. Index ≈ tier.
const WEAPONS = [
  { name: 'gdb probe',       glyph: '-', color: '#b3c0d3', min: 2, max: 3 },
  { name: 'git bisect',      glyph: '/', color: '#95e6cb', min: 3, max: 4 },
  { name: 'fuzzer',          glyph: '\\', color: '#d4bfff', min: 2, max: 6 },
  { name: 'static analyzer', glyph: '|', color: '#73d0ff', min: 4, max: 5 },
  { name: 'valgrind',        glyph: '¶', color: '#ffd580', min: 5, max: 6 },
  { name: 'sanitizer',       glyph: '‡', color: '#ff3333', min: 6, max: 8 },
];
const STARTING_WEAPON = { name: 'vim keybindings', min: 1, max: 2 };

// ---- character advancement --------------------------------------------
const LEVEL_TITLES = [
  'Intern', 'Junior Dev', 'Mid-level Dev', 'Senior Dev',
  'Staff Eng', 'Principal Eng', 'Distinguished Eng', 'Fellow',
];
function xpToNext(lvl) { return 10 + lvl * 8; }

// ---- items ------------------------------------------------------------
const ITEM_TYPES = {
  print: { name: 'print statement', glyph: '"', color: '#73d0ff' },
  bp:    { name: 'breakpoint',      glyph: '●', color: '#f07178' },
  coffee:{ name: 'coffee',          glyph: '+', color: '#d4a373' },
  patch: { name: 'hotfix patch',    glyph: '†', color: '#ffd580' },
  catch: { name: 'try/catch block', glyph: '[', color: '#95e6cb' },
};

const PRINT_LINES = [
  'console.log("here")',
  'console.log("HERE 2")',
  'console.log("WHY IS THIS UNDEFINED")',
  'printf("got here 7\\n")',
  'console.log("if you see this, it worked")',
  'dbg!(&self.ptr)',
  'System.out.println("AAAAAAA")',
  'eprintln!("entering the danger zone")',
  'console.log(JSON.stringify(state, null, 2))',
  'fprintf(stderr, "plz\\n")',
];

// colors shared with the renderer
const COLORS = {
  bg: '#0a0e14',
  wall: '#3d4a5c',
  wallDim: '#232c3a',
  floor: '#2a3546',
  floorDim: '#161d29',
  stairs: '#ffd580',
  player: '#7fd962',
};
