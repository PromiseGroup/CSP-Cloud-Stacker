# Cloud Stacker — visual redesign handoff ("Tower of light")

You are re-skinning an existing web game. **This is a visual-only change.** The game rules, scoring, input handling, Supabase/Firebase save, and the Dynamics 365 form embed already work. Keep them. Replace how things *look*.

## What's in this folder

| Path | What it is | How to use it |
|---|---|---|
| `CURSOR_HANDOFF.md` | This spec. The source of truth. | Read fully before editing. |
| `stack-renderer.js` | Working Canvas 2D renderer for the whole game scene (background, isometric blocks, effects). No dependencies; exposes `window.StackRenderer`. | Copy into the project and call it from the game's render loop. Port it to a module if the project uses ES modules. Don't rewrite the maths. |
| `preview.html` | Playable reference that wires the renderer to a minimal game loop, plus the title and game-over overlays. Open it in a browser. | Use it as the **integration example**: how the camera, effects and timings connect to drop events. Don't copy its game rules over the real ones. |
| `screenshots/` | Renders of `preview.html` at 390×844 (phone) and 1440×900 (desktop): title, play, perfect, slice, game over. Rendered **without** the web fonts, so the type in them is a fallback. | The visual target for the canvas and overlays. |
| `reference/*.dc.html` | The original design artboards (one per screen). They need a design-tool runtime, so they won't open standalone. Readable HTML + inline styles + the geometry code. | Exact copy, colours, spacing and sizes for the DOM screens (A, C, D). Reference only. |

## Ground rules

1. Don't change gameplay logic, scoring values (+500 perfect / +100 slice), the perfect-landing tolerance, the speed curve, the save call, or the D365 field population/redirect.
2. Keep existing element IDs, event handlers and form field names. Change markup *classes/structure* and canvas *drawing* only.
3. The game stays one-axis: the block slides along one direction. In the new look that axis is drawn diagonally (isometric x). Your existing 1-D `x`/`width` values map straight onto world `x0`/`w`. See "Mapping the existing game state".
4. No emoji, no extra UI elements beyond what's listed here.

## Implementation order

1. Load fonts (see Typography).
2. Add `stack-renderer.js`. Build the backdrop, grain and floor caches on init and on resize.
3. Replace the canvas render function with the draw order below. Map game state → world units.
4. Wire effects to the existing drop outcomes: perfect, slice, miss.
5. Add the camera easing.
6. Restyle Screen A (title), the HUD, Screen C (game-over modal), and Screen D (raffle) with the Tailwind markup below.
7. Build the **art layer** (section below) with its stand-ins and asset slots.
8. Compare against `screenshots/` at 390×844 and 1440×900. Run the acceptance checklist.

## Design tokens

```
night        #02060F   page/canvas base
navy-1       #040C22
navy-2       #071D45
navy-3       #0B3470   sky gradient centre
azure        #0078D4   glows
azure-btn    #0070C9   primary buttons (white text passes 4.5:1); hover #0A7BDA
cyan         #5BE3FF   accent: "stack." in title, perfect, focus caret
led          #7CF5FF
ice          #E9FDFF   active block edge
amber        #FFB23F   ONLY for slice / game-over signals
amber-light  #FFE2A8
text         #F4F8FF
text-muted   #A9BDDB
text-dim     #7F93B5
panel        #061430   modal card
panel-2      #0A1D42   score box, inputs
border       #24467A   input border; focus #3AA0FF + ring rgba(0,120,212,.28)
```

## Typography

Add to `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Mulish:ital,wght@0,200..1000;1,200..1000&family=Martian+Mono:wdth,wght@75..112.5,100..800&display=swap">
```

- **Mulish** (company brand font: display + body + buttons). Headlines: weight 900, letter-spacing −0.035em, line-height .95. Buttons: weight 800, letter-spacing .16em, uppercase. Body: 400–600.
- **Martian Mono** (score, labels, eyebrows). Eyebrows: 10–11px, weight 500–600, letter-spacing .24–.34em, uppercase.
- Canvas text needs the fonts loaded first: `await document.fonts.load("500 8px 'Martian Mono'")` and `document.fonts.load("900 46px 'Mulish'")` before the first frame.

## The isometric model

World units: `x` = sliding axis (block width), `z` = depth (constant 110), `y` = up.

```
screenX = ox + (x − z) · 0.8660254 · k
screenY = oy + ((x + z) · 0.5 − y) · k
```

- `k` = `StackRenderer.scaleFor(w, h)`: 1.0 on a 390-wide phone, up to 1.6 on desktop.
- Geometry (`StackRenderer.GEOM`): depth 110, block height 22, on-prem base height 50, base width 170, sliding block hovers 34 above the stack.
- Visible faces per block: **top** (lit), **left** (the long face along x; the label goes here), **right** (short end, darkest). Draw stack blocks bottom → top (painter's order).

### Mapping the existing game state

Your game already tracks each block's horizontal position and width in its own units. Convert at render time only:

```js
const WORLD_PER_UNIT = StackRenderer.GEOM.baseW / BASE_WIDTH_IN_GAME_UNITS;
const toWorld = (blk, i) => ({
  x0: (blk.x - BASE_X_IN_GAME_UNITS) * WORLD_PER_UNIT,
  w:  blk.width * WORLD_PER_UNIT,
  y0: GEOM.baseH + i * GEOM.blockH,   // i = 0 for the first cloud block
  h:  GEOM.blockH,
  label: blk.label,                   // CSP service name
});
```

The base block (On-Premise) is `{ x0: 0, w: 170, y0: 0, h: 50, label: 'On-prem' }`, drawn with `{ kind: 'base' }`.

### Labels on narrow blocks

Blocks shrink as the player misses, so `drawBlock` fits every label to its face (`fitLabel()` in `stack-renderer.js`). Don't draw labels any other way. In order:

1. Blocks under 96 world units wide drop their LED dots to free room.
2. Full name at 8px.
3. Tighter letter-spacing.
4. Smaller type, down to 6px.
5. Short code: `block.short` if set, otherwise the `SHORT_LABELS` map, e.g. SHAREPOINT → SPO.
6. Truncate with "…".
7. Hide the label.

The text is also clipped to the face as a safety net. To add services, add their short codes to `SHORT_LABELS`.

## Frame draw order (Screen B canvas)

```
1  ctx.drawImage(backdrop)                         // sky + azure bloom + iso lattice (cached)
2  drawAtmosphere(…, stackTopScreenX, stackTopScreenY)   // drifting haze + light column over stack top
3  ctx.save(); apply shakeOffset()                  // everything until step 9 shakes
4  drawFloor(floor, view)                          // only while the base is on screen
5  stack blocks, bottom → top:
     base  → drawBlock(…, { kind: 'base' })
     cloud → drawBlock(…, { kind: 'cloud', t, flash, cut })
            t = 1 − (topIndex − i) / 12   (top block always brightest; skip blocks below the screen)
6  drawDropGuide(top, active) + drawTrail(active, dir)   // shadow on the stack + dashed rails + motion ghosts
7  drawBlock(active, { kind: 'active' })
8  effects: drawPerfectRings, drawCutLine, drawShard (for every live shard)
9  ctx.restore()
10 drawMotes, drawFog
11 drawPopup for live score pop-ups
12 drawGrain                                       // overlay blend, very last
```

`preview.html` → `render()` is a working version of exactly this.

## Camera

Ease the projection origin every frame so the stack top stays at a fixed screen height:

```js
const anchor = mode === 'title' ? (W >= 900 ? 0.30 : 0.24) : 0.46;   // fraction of viewport height
const targetOy = H * anchor + (top.y0 + top.h - top.x0 * 0.5) * k;
const targetOx = StackRenderer.centredOriginX(W, k) + (mode === 'title' && W >= 900 ? W * 0.16 : 0);
view.oy += (targetOy - view.oy) * Math.min(1, dt * 5);
view.ox += (targetOx - view.ox) * Math.min(1, dt * 5);
```

## Effects (hook to existing drop outcomes)

| Event | What to trigger | Timing |
|---|---|---|
| **Perfect drop** | Landed block `flash`: 1 for 120 ms, then linear to 0 over 250 ms. `drawPerfectRings(block, p)` + `drawPerfectXs(view, block, p)`. Mascot → *impressed* 900 ms. `shakeOffset(p)` (6px × k, decaying). `drawPopup(…, 'perfect', p)` above the block. HUD score turns cyan for 120 ms. | rings 600 ms · shake 300 ms · popup 900 ms |
| **Slice** | Kept block `cut`: 0.9 → 0 over 450 ms (amber right face; only when the overhang was on the +x side). `drawCutLine(x = cut position)` + `drawCutXs(…)` (400 ms). Push a shard `{x0, w, y0, h, side}` and draw it with `drawShard(shard, secondsSinceCut)` until it returns `false`. `drawPopup(…, 'slice', p)`, offset 70px × k to the right. Mascot → *ouch* 900 ms (2 quick 3px wiggles). | cut line 250 ms · shard ~1.1 s · popup 900 ms |
| **Miss (game over)** | The whole active block becomes a shard (`side` = which way it missed). Stop input. Mascot → *miss* (stays until the card shows). After ~750 ms show Screen C; the corner mascot hides and the *crashed* peek appears on the card. | — |
| **Next block** | Spawn ~300 ms after a landing so the effects read. It isn't drawn and can't be dropped during that gap. | 300 ms |

## DOM screens (Tailwind)

Arbitrary values are used so no Tailwind config is needed. Font families: `font-['Mulish']`, `font-['Martian_Mono']`. Keep your existing IDs and handlers. Exact source: `reference/Main.dc.html`, `GameOver.dc.html`, `Raffle.dc.html`.

### HUD (Screen B)

```html
<div class="fixed top-5 right-[22px] flex flex-col items-end gap-1 pointer-events-none font-['Martian_Mono']">
  <span class="text-[10px] font-medium tracking-[.32em] text-[#7F93B5]">SCORE</span>
  <span id="score" class="text-[40px] md:text-[64px] font-semibold [font-stretch:87.5%] leading-none tracking-[-0.02em] tabular-nums text-[#F4F8FF]">0</span>
</div>
<!-- first 4 drops only -->
<div class="fixed inset-x-0 bottom-[34px] flex items-center justify-center gap-3 pointer-events-none font-['Martian_Mono']">
  <span class="relative w-[22px] h-[22px]"><span class="absolute inset-0 rounded-full border-[1.5px] border-[#5BE3FF] animate-ping"></span><span class="absolute left-[7px] top-[7px] w-2 h-2 rounded-full bg-[#5BE3FF]"></span></span>
  <span class="text-[10px] font-medium tracking-[.28em] text-[#A9BDDB]">TAP ANYWHERE TO DROP</span>
</div>
```

Wordmark (top-left, all screens; `z-index` above overlays):

```html
<div class="fixed z-50 top-[26px] left-[22px] flex items-center gap-2.5 pointer-events-none">
  <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><path d="M11 3 L20 7.5 L11 12 L2 7.5 Z" fill="#5BE3FF"/><path d="M2 11 L11 15.5 L20 11" stroke="#2E9BFF" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M2 14.5 L11 19 L20 14.5" stroke="#1C5FB8" stroke-width="1.6" fill="none" stroke-linejoin="round"/></svg>
  <span class="font-['Martian_Mono'] text-[11px] font-semibold tracking-[.24em] text-[#DCE8FA]">CLOUD STACKER</span>
</div>
```

### Screen A — Title

The canvas keeps rendering behind it in **attract mode**: the base plus ~8 pre-stacked blocks, the active block sliding slowly (90 world units/s), no drop guide. The overlay is DOM:

```html
<section id="screen-title" class="fixed inset-0 flex flex-col justify-end min-[900px]:justify-center pointer-events-none">
  <div class="absolute inset-x-0 bottom-0 h-[52%] bg-[linear-gradient(to_bottom,rgba(2,6,15,0)_0%,rgba(2,6,15,.82)_38%,#02060F_70%)]
              min-[900px]:inset-y-0 min-[900px]:h-auto min-[900px]:w-[60%] min-[900px]:bg-[linear-gradient(to_right,#02060F_0%,rgba(2,6,15,.85)_45%,rgba(2,6,15,0)_100%)]"></div>
  <div class="relative w-full max-w-[420px] mx-auto px-6 pb-8 flex flex-col gap-[26px] pointer-events-auto
              min-[900px]:mx-0 min-[900px]:ml-[8vw] min-[900px]:p-0 min-[900px]:max-w-[460px] min-[900px]:gap-8">
    <div>
      <h1 class="font-['Mulish'] text-[44px] min-[900px]:text-[68px] leading-[.95] font-black tracking-[-0.035em] text-[#F4F8FF]">Build your<br>cloud <span class="text-[#5BE3FF]">stack.</span></h1>
      <p class="mt-3.5 text-[15px] min-[900px]:text-[17px] leading-[1.45] text-[#A9BDDB] max-w-[310px] min-[900px]:max-w-[380px]">Drop each service onto the one below. Land it clean for +500. Any overhang gets sliced off.</p>
    </div>
    <button id="start-btn" type="button" class="cs-pulse h-[60px] w-full min-[900px]:max-w-[340px] rounded-[14px] bg-[#0070C9] hover:bg-[#0A7BDA] text-white font-['Mulish'] text-[15px] font-extrabold tracking-[.16em] uppercase flex items-center justify-center gap-3">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8.5" opacity=".5"/></svg>
      Tap to start
    </button>
  </div>
</section>
```

```css
.cs-pulse { animation: cs-pulse 1.8s ease-out infinite; }
@keyframes cs-pulse {
  0%   { box-shadow: 0 0 0 0 rgba(0,120,212,.6), 0 12px 32px rgba(0,112,201,.45); }
  100% { box-shadow: 0 0 0 18px rgba(0,120,212,0), 0 12px 32px rgba(0,112,201,.45); }
}
```

### Screen C — Game over + initials

The canvas stays frozen behind it. Blur it with the backdrop:

```html
<section id="screen-gameover" class="fixed inset-0 flex items-center justify-center p-5 bg-[rgba(2,6,15,.6)] backdrop-blur-[7px] backdrop-saturate-[.8]">
  <div class="w-full max-w-[380px] rounded-[22px] bg-[#061430] border border-[rgba(110,170,255,.22)] shadow-[0_30px_80px_rgba(0,0,0,.6)] px-6 pt-7 pb-6 flex flex-col gap-[22px]">
    <div>
      <div class="flex items-center gap-2 font-['Martian_Mono'] text-[10px] font-semibold tracking-[.34em] text-[#FFB23F]">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#FFB23F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12.5h8"/><path d="M3 9.5h6"/><path d="M10.5 3.5l3.5 4.5-2.5 1.5"/></svg>
        GAME OVER
      </div>
      <h2 class="mt-2.5 font-['Mulish'] text-[36px] leading-none font-black tracking-[-0.02em] text-[#F4F8FF]">Stack crashed!</h2>
    </div>
    <div class="flex items-end justify-between gap-3 rounded-[14px] bg-[#0A1D42] px-[18px] pt-[18px] pb-4">
      <div>
        <div class="font-['Martian_Mono'] text-[10px] font-medium tracking-[.3em] text-[#8DA2C4]">FINAL SCORE</div>
        <div id="final-score" class="mt-1.5 font-['Martian_Mono'] text-[54px] font-semibold [font-stretch:87.5%] leading-[.95] tracking-[-0.03em] tabular-nums text-white">0</div>
      </div>
      <!-- optional: remove if you don't track these -->
      <div class="flex flex-col items-end gap-1 pb-1 text-[13px] text-[#A9BDDB]">
        <span><b class="text-[#F4F8FF]" id="floors">0</b> floors</span>
        <span><b class="text-[#5BE3FF]" id="perfects">0</b> perfect</span>
      </div>
    </div>
    <div>
      <label for="initials" class="block mb-3 text-[14px] font-semibold text-[#DCE8FA]">Your initials for the leaderboard</label>
      <input id="initials" maxlength="3" autocapitalize="characters" autocomplete="off" spellcheck="false"
             class="w-full h-[76px] rounded-xl bg-[#0B2350] border-[1.5px] border-[#3AA0FF] shadow-[0_0_0_4px_rgba(0,120,212,.28)] text-white text-center uppercase font-['Martian_Mono'] text-[38px] font-semibold tracking-[.5em] pl-[.5em] outline-none">
    </div>
    <button id="save-score" type="button" class="h-[58px] rounded-[14px] bg-[#0070C9] hover:bg-[#0A7BDA] text-white font-['Mulish'] text-[15px] font-extrabold tracking-[.16em] uppercase shadow-[0_12px_30px_rgba(0,112,201,.4)]">Save score</button>
  </div>
</section>
```

### Screen D — Raffle (D365)

Static background: the same sky gradient as the canvas backdrop, with the bloom at the top. A "saved" chip, headline, and the D365 container. Style the embedded D365 form's own inputs to match: 46px height, radius 10px, bg `#081733`, border `#22406E`, text `#F4F8FF`, labels 12px/600 `#C9D7EC`, focus border `#3AA0FF` + ring, submit button = primary button. Layout and field skin: `reference/Raffle.dc.html`.

```html
<section id="screen-raffle" class="fixed inset-0 overflow-y-auto bg-[radial-gradient(120%_60%_at_50%_0%,#0B3470_0%,#071D45_34%,#040C22_66%,#02060F_100%)]">
  <div class="max-w-[420px] mx-auto px-5 pt-[26px] pb-6 flex flex-col gap-[22px]">
    <div class="self-start flex items-center gap-2.5 rounded-full bg-[#0A1D42] border border-[rgba(91,227,255,.25)] py-2 pl-2.5 pr-3.5">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><circle cx="9" cy="9" r="8" fill="#5BE3FF" opacity=".16"/><path d="M5.2 9.3l2.4 2.3 5.2-5.2" stroke="#5BE3FF" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <span id="chip-initials" class="font-['Martian_Mono'] text-xs font-semibold tracking-[.12em]">KRZ</span>
      <span class="w-px h-3.5 bg-[#2A4676]"></span>
      <span id="chip-score" class="font-['Martian_Mono'] text-xs font-semibold tabular-nums">0</span>
      <span class="text-xs text-[#A9BDDB]">saved</span>
    </div>
    <div>
      <h1 class="font-['Mulish'] text-[36px] leading-[.98] font-black tracking-[-0.035em] text-[#F4F8FF]">Enter the prize raffle!</h1>
      <p class="mt-2.5 text-[15px] leading-[1.45] text-[#A9BDDB]">Leave your details for a chance to win <span class="text-[#F4F8FF] font-semibold">[PRIZE]</span>.</p>
    </div>
    <div class="rounded-[18px] border border-dashed border-[rgba(120,170,255,.38)] bg-[rgba(6,20,48,.55)] p-4">
      <!-- existing D365 embed placeholder div goes here, unchanged -->
    </div>
    <p class="text-center text-xs text-[#7F93B5]">After you submit, the game resets for the next player.</p>
  </div>
</section>
```

## Art layer ("tagged infrastructure")

A hand-drawn layer by the game's artist sits **on top of** the clean render, like graffiti on a server rack. It never replaces the corporate look; it shows up only at the moments below. It has its own palette, kept separate from the blues:

```
chalk  #F2EEE6   ink  #0A0D14   pink  #FF3EA5
```

**Build every slot now with the stand-in, and load the real art from `/assets/art/` when the file exists.** The game must look finished with stand-ins only. When a PNG is added, it replaces its stand-in with no code change: try to load it, and fall back if it 404s. `preview.html` shows every stand-in working.

| # | Element | Where / when | Asset file(s) (transparent PNG @2x) | Stand-in until then |
|---|---|---|---|---|
| 1 | **× marks** | Perfect: 9 marks burst on an iso ellipse around the landed block, alternating pink/chalk, scale in, then fade (600 ms). Slice: 3 chalk marks at the ends of the cut line (400 ms). | `x-1.png` … `x-4.png`, drawn **black on transparent**, ~128px. Tint once at load with `StackRenderer.tintSprite(img, ART.pink)` / `ART.chalk` and cache. | `drawPerfectXs()` / `drawCutXs()` draw procedural ×'s. Pass the tinted sprites as the optional last argument once they exist. |
| 2 | **Mascot: the on-prem server** | A stubby little server box with a screen for a face (the legacy machine being migrated, deadpan about it). DOM `<img>` over the canvas, 3.2 s idle bob (±3px). **Title:** leaning against the on-prem base's right face. Position each frame from `view.p(GEOM.baseW, 40, 0)`: left = x + 6, top = y − height. Width 80px (104px at ≥900px wide). **Play:** bottom-left, `left:18px; bottom:66px; width:60px` (desktop `left:44px; bottom:84px; width:84px`). Swap to *impressed* for 900 ms on every perfect, *ouch* for 900 ms on every slice (+100), then back to *idle*. **Miss:** switch to *miss* and keep it in the corner until the game-over card appears (~750 ms), then hide the corner mascot. **Game over:** *crashed* pose peeks over the modal card's top-right edge (`position:absolute; right:26px; top:-74px; width:84px`), hands gripping the edge. | `mascot-idle.png`, `mascot-impressed.png`, `mascot-ouch.png`, `mascot-miss.png` (all ≈400×480, feet on the bottom edge; *ouch* = squinting `> <` eyes, gritted teeth, sweat drop, pink pain ticks; *miss* = wide eyes looking down, open mouth, pink `!!`), `mascot-crashed.png` (top of the server + hands only, × eyes on its screen, smoke from its cable, ≈420×410, hands on the bottom edge). | The placeholder SVGs in `preview.html` (`.pose-idle`, `.pose-impressed`, `.pose-ouch`, `.pose-miss`, `.peek`). |
| 3 | **Text wall** | Background of Screen C (between the blurred scene and the card) and Screen D (behind the content). Opacity 7.5% (C) / 6% (D), rotated −4°, full screen. Phrase: `STILL NOT ON-PREM × SCALE IT ×`. **Never** behind gameplay. | `wall.png`: a **seamless tileable** chalk-lettering texture, white on transparent, 1024×1024, used as a repeating `background-image`. | Repeated lines in Permanent Marker (Google Font, stand-in only). See `.wall` in `preview.html`. |

Rules for the art layer:

- Only these three elements. No extra decoration, no art behind active gameplay.
- Art elements are `aria-hidden`, have `pointer-events: none`, and never block a tap.
- Respect `prefers-reduced-motion`: no bob, × marks appear without scaling.

## Acceptance checklist

- [ ] At 390×844 the play screen matches `screenshots/phone-2-play.png`: stack centred, top block ~46% down, score top-right, fog at the bottom.
- [ ] Blocks are isometric: lit top, dark sides, neon edge on the two front top edges, white mono label on the long face, LED dots.
- [ ] Colour climbs with height: lower blocks are deeper azure, the top blocks brightest cyan.
- [ ] Perfect: white flash, two rings, short shake, "PERFECT / +500" pop-up, score turns cyan briefly.
- [ ] Slice: amber cut line, amber cut face, shard tumbles away and fades, "SLICED / +100" pop-up in amber, mascot winces (*ouch*).
- [ ] Miss: block falls away, mascot shows *miss* in the corner; modal appears ~750 ms later over a blurred, dimmed scene.
- [ ] Title: tower visible above the copy on phone; on ≥900px wide the copy is left and the tower right.
- [ ] Mulish + Martian Mono actually load (check the Network tab); all display/body/button text is Mulish; canvas labels and score use Martian Mono.
- [ ] Art layer: all three slots render with stand-ins; dropping a PNG into `/assets/art/` swaps it in with no code change.
- [ ] Canvas is crisp on retina (backing store × devicePixelRatio, capped at 2) and resizes correctly.
- [ ] Holds 60 fps on a mid-range phone (backdrop/floor/grain are cached; only the scene redraws).
- [ ] Gameplay, scoring, saving and the D365 flow behave exactly as before.
