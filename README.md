# segfault-safari

**A stack trace dungeon crawler.** A wild SIGSEGV appeared in production. Descend the
call stack frame by frame — `main()` down through the router, the middleware, a sketchy
seven-year-old npm dependency, node internals, libc, and finally the kernel — to find
the root cause and squash **THE BUG**.

## Play

No build step, no dependencies. Either open `index.html` directly, or:

```sh
python3 -m http.server 8000
# → http://localhost:8000
```

## How it works

- **Each level is a stack frame.** The `>` tile "steps into" the next call. There is no
  going back up until the bug is fixed. The sidebar shows the trace as you uncover it.
- **Exceptions are the enemies.** Bump into them to attack. They get more HP and hit
  harder the deeper the frame.
  - `∅` NullPointerException — chases you; it was nothing all along
  - `±` OffByOneError — sometimes wanders (and misses) by exactly one
  - `∞` InfiniteLoop — patrols its loop until you get close
  - `ϟ` RaceCondition — sometimes acts twice per turn
  - `≈` MemoryLeak — periodically leaks little `~` allocations
  - `H` Heisenbug — teleports away when you hit it without killing it
  - `X` SegmentationFault — slow, hits hard
  - `Ø` DoubleFree — killing it scatters `u` UseAfterFree danglers
  - `K` KernelPanic — slow, hits very hard, kernel frames only
  - `Ж` THE BUG — a dangling pointer, waiting at the bottom of the stack
- **Weapons are debug tools.** You start with bare `vim keybindings` (1–2) and find
  better on the way down: `-` gdb probe, `/` git bisect, `\` fuzzer (swingy), `|` static
  analyzer, `¶` valgrind, `‡` sanitizer (6–8). Walking over a better weapon auto-equips it.
- **Advancement is a promotion ladder.** Kills earn XP; each level is a promotion
  (Intern → Junior → … → Distinguished → Fellow) worth +3 max HP, and +1 flat damage
  every other level.
- **`"` print statements are light sources** — each one permanently extends your sight radius.
- **`●` breakpoints are checkpoints — and single-use.** A crash resumes execution at the
  breakpoint (burning it out) instead of dumping core. They only appear on even frames,
  so spend them wisely.
- `+` coffee heals, `†` hotfix patches add flat damage, `[` try/catch blocks raise defense.

## Controls

| Key | Action |
| --- | --- |
| arrows / `wasd` / `hjkl` | move / attack |
| `space` or `.` | wait one turn |
| `?` | help |
| `R` | restart |

## Code layout

Plain HTML/CSS/JS, no framework. Classic scripts sharing globals, loaded in order:

| File | Contents |
| --- | --- |
| `js/data.js` | tiles, call-stack frames, enemy & item definitions |
| `js/fov.js` | Bresenham line of sight + field of view |
| `js/dungeon.js` | rooms-and-corridors level generation, boss arena |
| `js/game.js` | game state, seeded RNG, turn logic, combat, checkpoints |
| `js/render.js` | canvas renderer, sidebar/log/overlay DOM |
| `js/main.js` | keyboard input, boot |
