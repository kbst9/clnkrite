# clnkrite UX spec — tactical control board

Direction from Kevin: more **Anduril-style control board**, less SaaS. Dark tactical ops surface,
dense, utilitarian, status-first, tight type, high contrast, mission-control / defense-industrial.
The timeline and lanes should read as a **board**, not a web app. Kill: rounded marketing cards,
gradients, "friendly startup dashboard" energy.

This is a restyle + information-architecture pass. No route, store, API, or wrangler change is
required; everything below lands in `src/client/index.css` (tokens) and Tailwind classes in
`src/client/components/*` / `src/client/pages/*`. The one new data surface (status strip) reads
values the Worker already returns (`/api/engines` health, job `queuePosition`, write-queue depth).

## 1. What goes (current tree, concrete)

- `index.css`: the two `radial-gradient` body washes, the SVG noise `background-image`, the
  `.grain-overlay` element (`main.tsx`), and all five `.clip-*` `linear-gradient` fills.
- `Bricolage Grotesque` as `--font-display`. One voice: IBM Plex Mono for data/labels/controls,
  IBM Plex Sans only for paragraph copy (drawer blurbs). Nothing else.
- Warm "analog desk" palette (`brass #d4a056`, `paper #e6dfd2`, `ember`) as *chrome*. Warm hues
  survive only as lane identity colors and status semantics (§3).
- `rounded-full` (JobChip, arm button), `rounded-md` cards (AddLaneDrawer sources, ClipMenu,
  PictureViewer), `shadow-2xl`/`shadow-md`, `backdrop-blur` on the top bar, `hover:brightness-110`.
- Marketing copy: "The desk", "New reel", "No sessions yet. Name one and start a reel.",
  5xl hero heading on `ProjectList.tsx`.

## 2. Tokens (replace the `@theme` block in `src/client/index.css`)

```css
@theme {
  --font-mono: "IBM Plex Mono", ui-monospace, monospace;
  --font-sans: "IBM Plex Sans", ui-sans-serif, sans-serif;

  /* surfaces — cold, near-black, 4 steps */
  --color-bg0:  #050607;   /* app background */
  --color-bg1:  #0a0c0e;   /* panels, rails, drawers */
  --color-bg2:  #101317;   /* cells, inputs, clip bodies */
  --color-bg3:  #161a1f;   /* hover cells */

  /* structure */
  --color-line:        #22282e;  /* hairlines, 1px everywhere */
  --color-line-strong: #333b44;  /* bar lines, focused borders */

  /* content */
  --color-fg:       #d6dde3;  /* primary text */
  --color-fg-dim:   #8a949d;  /* secondary text, waveforms */
  --color-fg-faint: #545e66;  /* disabled, grid labels */

  /* status semantics — the ONLY saturated chrome colors */
  --color-ok:    #3fb950;   /* bridge up, job succeeded, SAVED */
  --color-warn:  #d29922;   /* queued, ingesting, SYNCING */
  --color-alert: #f2555a;   /* offline, failed, destructive, playhead */
  --color-idle:  #6e7681;   /* unknown/probing */

  /* single interaction accent (selection, armed, primary action) */
  --color-accent: #e8c268;

  /* lane identity — flat, desaturated vs today, used for 2px id-stripes and clip borders only */
  --color-lane-music3:  #c9a227;
  --color-lane-acestep: #3f9d94;
  --color-lane-synth:   #8b7ec9;
  --color-lane-import:  #7d8ca0;
  --color-lane-picture: #b3616f;

  --radius-0: 0px;   /* default: square */
  --radius-1: 2px;   /* max radius anywhere (inputs, tags) */
}
```

Rules: backgrounds only from `bg0–bg3`; every border is `1px solid var(--color-line)` (strong
variant for emphasis); **no** box-shadows, blurs, gradients, or opacity-based "cards" — panels
separate by hairline, not elevation. `font-variant-numeric: tabular-nums` globally.

## 3. Type scale (mono-first, tight)

| Role | Size/line | Weight | Case/tracking |
|---|---|---|---|
| Data labels, table headers, lane kind, status strip | 10/14 | 500 | UPPERCASE, +0.08em |
| Body data, chips, inputs, menus | 12/16 | 400 | normal |
| Control text, buttons | 12/16 | 600 | UPPERCASE, +0.06em |
| Playhead readout, section titles | 16/20 | 600 | tabular |
| Project title (top bar, list) | 18/24 | 600 | normal |

Nothing larger than 18 px in the app (delete the `text-5xl` hero on `ProjectList.tsx`). Spacing on
a 4 px grid; control heights: 24 px buttons/toggles, 28 px inputs, 32 px bars.

## 4. Layout: two-row command header replaces `TopBar`

### Row 1 — status strip (new, 28 px, full-width, `bg1`, hairline bottom)

Left→right segments, each `10/14 uppercase mono`, separated by `1px` vertical rules, each with a
6 px square (not round) state block:

```
CLNKRITE · <PROJECT-TITLE> │ BRIDGE ▪ONLINE │ MUSIC3 ▪ MiniMax-Music3 │ ACE-STEP ▪ — │
DEMUCS ▪ RDY │ QUEUE 0/IDLE │ JOB — │ SAVE ▪ SAVED │            14:32:07 UTC
```

- **BRIDGE**: `ok/alert/idle` from `/api/engines`; polled every 15 s (fixes gap G3), not once.
- **MUSIC3 / ACE-STEP / DEMUCS**: model id string / `—`; block color per `health`.
- **QUEUE**: `depth/RUNNING|IDLE` from `health.queue`.
- **JOB**: active job as `MUSIC3 RUN 01:42 P0` (kind · state · elapsed mm:ss · queue position) —
  the data the Worker already returns and `JobChip` drops (gap G4). Click → jobs panel (§7).
- **SAVE**: write-queue state — `SAVED` (ok) / `SYNCING n` (warn) / `OFFLINE` (alert), from
  `WriteQueue.pending`.
- The current `BridgeBanner` stays only for the offline case, restyled: `bg0`, `alert` left
  border 2px, mono 12px, no tinted wash.

### Row 2 — command bar (40 px, `bg1`)

- **Left, transport cluster:** square 28 px `PLAY/STOP` (filled `fg` on `bg0` when active),
  `LOOP` toggle, then the playhead readout `005.3.42` at 16/20 tabular — the largest number on
  screen. Then compact fields as `LABEL value` pairs inline (BPM `120`, KEY `C MAJ`, SIG `4/4`,
  LEN `128`, LOOP `0–128`): 10px label above is deleted; label sits left of value at
  `fg-faint`, value editable-on-click, 28 px tall, `bg2`.
- **Right:** `SNAP 1/4` toggle, `CACHE CLR`, and `GENERATE` as the single accent action — 28 px,
  `--color-accent` background, `bg0` text, square corners.
- VIBE moves out of the header into the Generate drawer (it exists to seed captions; it is not
  transport data).

## 5. Timeline chrome ("board, not web app")

- **Ruler (24 px, `bg1`)**: bar lines full-height `line-strong` with bar number `10/14 fg-faint`
  top-left of each bar; beat ticks 4 px `line`; sub-beat ticks appear past 48 px/beat zoom.
- **Loop brace lane (12 px, above ruler)**: draggable bracket `[══════]` in `fg-dim`, handles at
  both ends, double-click to set loop to a bar; replaces the two bare number inputs (gap T4).
- **Playhead**: 1 px `alert` line with a 7 px triangle head in the ruler; time cursor on hover as
  a `fg-faint` ghost line with `bar.beat` readout chip.
- **Grid**: vertical hairlines per bar on the lane area (`line` at 20% alpha); lane rows separate
  by 1 px `line` on `bg0`; even/odd lane rows alternate `bg0`/`#07090a` for scanability.
- **Clips**: flat `bg2` body, 1 px border in the lane color, **2 px id-stripe** on the left edge
  in the lane color, label `10/14 uppercase` top-left in `fg-dim`. Waveform (once gap T1 is
  fixed) drawn in `fg-dim`, peaks-filled, no anti-aliased prettiness. Selection = 1 px `accent`
  border plus 4 corner ticks (reticle brackets), not a glow ring. Fades render as thin diagonal
  lines from corner to `fadeSec` point. Overlaps: 60% alpha bodies, borders full strength.
- **Synth clips**: same body, note dots plotted as 2 px squares at pitch/time inside the clip.
- **Picture lane**: shorter row (48 px) with filmstrip placeholder cells (thumbnail strip when
  implemented, gap P1); clip border in `lane-picture`.
- **Lane rail (280 px, `bg1`)**: two dense rows per lane —
  - Row A (24 px): 3 px kind-color stripe, name (12/16, click-to-edit), then square 18 px
    toggles `R` `M` `S` `V`: 1 px border `line`, letters `10/14`; active = filled (`R`→`alert`,
    `M`→`warn`, `S`→`accent`, `V`→`ok`), no circles.
  - Row B (20 px): `VOL -6.0` and `PAN L12` as drag-to-scrub numerics (`fg-dim`, 10/14) replacing
    the two range sliders; `STEMS·4` as a square tag when children exist; `×` remove at far right.
- The zoom/snap hint line above the timeline (`Editor.tsx`) becomes part of the board: bottom
  status row (20 px, `bg1`): `ZOOM 28PX/B · SNAP 1/4 · SEL 2 CLIPS · ,/. NUDGE · S SPLIT`.

## 6. Drawers → panels

`AddLaneDrawer`, `GenerateDrawer`: right-side, full-height, 380/420 px, `bg1`, 1 px `line` left
border, **no shadow**. Header: `10/14 uppercase` title with a hairline rule; close is a square
`ESC ×` button. Add-lane sources become a dense list (36 px rows: kind stripe, NAME, one-line
availability in `fg-dim`; disabled rows show the reason in `alert` text) — not padded cards.
Generate: section-tag buttons as square 20 px tags; lyrics/caption textareas `bg2` mono 12;
`SUBMIT TO GPU` uses the accent style; the job list under it uses the jobs-panel row format (§7).
`ClipMenu` context menu: `bg1`, hairline border, square, 24 px rows, mono 12.

## 7. Jobs panel (new, closes the §9.1 "Job queue" drawer gap)

Opened from the JOB segment of the status strip. A right panel with a fixed-column mono table:

```
TIME      KIND     STATE      POS  ELAPSED  ACTION
07:41:02  MUSIC3   RUNNING    —    01:42    [ABORT]
07:39:55  DEMUCS   QUEUED     1    —        [DROP]
07:31:10  MUSIC3   SUCCEEDED  —    03:12    [PARAMS]
```

State words colored by the §2 semantics. `PARAMS` shows the stored job params (they are already
on the row) with a `REGENERATE` action — the §9.6 feature that currently has no surface.

## 8. Project list ("desk") → sortable ops table

`ProjectList.tsx` becomes: status strip (bridge only) on top; a 28 px toolbar with
`NEW PROJECT [title input] [CREATE]`; then a full-width table — `TITLE · BPM · KEY · SIG ·
UPDATED` — 32 px rows, hairline separators, hover `bg3`, mono throughout. Empty state is one line:
`NO PROJECTS.` The AGPL source-offer line stays (license obligation), 10/14 `fg-faint` footer.

## 9. Explicitly out of scope for this pass

No change to: routes, Zustand stores (except reading `WriteQueue.pending` and polling
`/api/engines`), Worker API, `wrangler.jsonc`, domains, bridge. Waveform rendering and the loop
brace are tracked as functional gaps (T1, T4 in `docs/gap-review.md`); this spec defines how they
look when built.
