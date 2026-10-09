/*
 * Cloud Stacker — "Tower of light" isometric renderer (Canvas 2D, no dependencies)
 * -------------------------------------------------------------------------------
 * Reference implementation of the visual design. It ONLY draws; it owns no game
 * rules. Your game keeps its own state (stack, active block, score) and calls
 * these functions every frame.
 *
 * World units (isometric):
 *   x = the sliding axis (block width lives here)
 *   z = depth (constant, GEOM.depth)
 *   y = up
 * Screen projection:  sx = ox + (x - z) * cos30 * k
 *                     sy = oy + ((x + z) * sin30 - y) * k
 *
 * Exposes window.StackRenderer.
 */
(function (global) {
  'use strict';

  // ── Design tokens ────────────────────────────────────────────────────────────
  const COLORS = {
    night: '#02060F',
    navy1: '#040C22',
    navy2: '#071D45',
    navy3: '#0B3470',
    azure: '#0078D4',
    azureButton: '#0070C9',
    cyan: '#5BE3FF',
    led: '#7CF5FF',
    ice: '#E9FDFF',
    amber: '#FFB23F',
    amberLight: '#FFE2A8',
    text: '#F4F8FF',
    textMuted: '#A9BDDB',
    textDim: '#7F93B5',
    base: { top: '#353F53', left: '#1D2432', right: '#121722', edge: '#6B7891', label: '#8D9AB2' },
    active: { top: 'hsl(194,100%,74%)', left: 'hsl(204,78%,34%)', right: 'hsl(206,80%,22%)', edge: '#E9FDFF' },
    shard: { top: 'hsl(194,72%,56%)', left: 'hsl(204,58%,24%)', right: 'hsl(206,60%,15%)' },
  };

  const GEOM = {
    depth: 110,   // z size of every block
    blockH: 22,   // height of a cloud block
    baseH: 50,    // height of the on-prem base
    baseW: 170,   // starting width (world units)
    hover: 34,    // gap between stack top and the sliding block
  };

  const MONO = "'Martian Mono', ui-monospace, monospace";
  const DISPLAY = "'Mulish', ui-sans-serif, system-ui, sans-serif";   // company brand font
  const COS = 0.8660254;
  const SIN = 0.5;

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  /** Scale factor: 1.0 on a 390-wide phone, up to 1.6 on large screens. */
  function scaleFor(width, height) {
    return clamp(Math.min(width / 390, height / 600), 0.85, 1.6);
  }

  /** A view = projection origin + scale. Mutate ox/oy to move the camera. */
  function makeView(ox, oy, k) {
    return {
      ox, oy, k,
      p(x, z, y) {
        return [this.ox + (x - z) * COS * this.k, this.oy + ((x + z) * SIN - y) * this.k];
      },
    };
  }

  /** Origin X that centres a footprint of width w (starting at x0) on screen. */
  function centredOriginX(screenW, k, x0 = 0, w = GEOM.baseW) {
    const xc = x0 + w / 2;
    const zc = GEOM.depth / 2;
    return screenW / 2 - (xc - zc) * COS * k;
  }

  /**
   * Colour for a cloud block. `t` = 0 (deep in the stack) → 1 (top of the stack).
   * Use t = 1 - (topIndex - i) / 12, clamped, so the top always glows brightest.
   */
  function tint(t) {
    t = clamp(t, 0, 1);
    const h = Math.round(216 - t * 18);
    return {
      top: `hsl(${h},92%,${Math.round(48 + t * 16)}%)`,
      left: `hsl(${h},70%,${Math.round(19 + t * 9)}%)`,
      right: `hsl(${h},72%,${Math.round(11 + t * 6)}%)`,
      edge: `hsl(${h - 10},100%,${Math.round(74 + t * 12)}%)`,
      edgeAlpha: 0.45 + t * 0.55,
    };
  }

  // ── Label fitting ────────────────────────────────────────────────────────────
  // Blocks shrink as the player misses, so labels must fit the face they sit on.
  // Ladder: full size → tighter tracking → smaller type (min 6px) → short code →
  // truncate with "…" → hide. Measured in world units (the label's own space).
  const LABEL_FIT = {
    inset: 9,          // gap from the block's left end
    ledZone: 24,       // room the two LEDs take at the right end
    endPad: 5,         // breathing room before the end / LEDs
    ledMinWidth: 96,   // blocks narrower than this drop their LEDs to free space
    size: 8, minSize: 6,
    spacing: 1.12, tightSpacing: 0.4,
    minChars: 3,       // below this many visible characters, hide the label
  };

  // Rack-style short codes, used when the full name can't fit even at minimum size.
  // Add or edit entries to match your service list. Keys are upper-case full names.
  const SHORT_LABELS = {
    'SHAREPOINT': 'SPO', 'DEFENDER': 'DEF', 'SENTINEL': 'SNTL', 'AZURE SQL': 'SQL',
    'AZURE AI': 'AI', 'COPILOT': 'CPLT', 'PURVIEW': 'PRVW', 'STORAGE': 'STOR',
    'COMPUTE': 'CMPT', 'INTUNE': 'INTN', 'FABRIC': 'FBRC', 'ENTRA': 'ENTRA', 'TEAMS': 'TEAMS',
    'ON-PREM': 'ON-PREM', 'ON-PREM NAV': 'NAV',
    // Directions EMEA / Business Central set
    'PURCHASING': 'PURCH', 'INVENTORY': 'INV', 'WAREHOUSE': 'WMS', 'PROJECTS': 'PROJ', 'SERVICE': 'SVC',
    'E-DOCUMENTS': 'E-DOC', 'APPSOURCE': 'APPSRC', 'POWER BI': 'PBI', 'AI AGENTS': 'AGENTS', 'AGENTIC ERP': 'AGENTIC',
  };

  /** Returns { text, size, spacing } that fits the block's label face, or null to hide it. */
  function fitLabel(ctx, b, showLeds, weight) {
    const L = LABEL_FIT;
    const avail = b.w - L.inset - L.endPad - (showLeds ? L.ledZone : 0);
    if (avail <= 0) return null;
    const full = b.label.toUpperCase();
    const measure = (text, size, spacing) => {
      ctx.font = `${weight} ${size}px ${MONO}`;
      if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`;
      // measureText includes letterSpacing in Chromium/Firefox; add it manually where it doesn't.
      const w = ctx.measureText(text).width;
      return 'letterSpacing' in ctx ? w : w + spacing * text.length;
    };
    const tryText = (text) => {
      if (measure(text, L.size, L.spacing) <= avail) return { text, size: L.size, spacing: L.spacing };
      const tight = measure(text, L.size, L.tightSpacing);
      if (tight <= avail) return { text, size: L.size, spacing: L.tightSpacing };
      const size = Math.floor(L.size * (avail / tight) * 10) / 10;
      if (size >= L.minSize) return { text, size, spacing: L.tightSpacing };
      return null;
    };
    const fitted = tryText(full) || (b.short && tryText(b.short.toUpperCase())) || (SHORT_LABELS[full] && tryText(SHORT_LABELS[full]));
    if (fitted) return fitted;
    // Last resort: truncate at minimum size.
    for (let n = full.length - 1; n >= L.minChars; n--) {
      const text = full.slice(0, n) + '…';
      if (measure(text, L.minSize, L.tightSpacing) <= avail) return { text, size: L.minSize, spacing: L.tightSpacing };
    }
    return null;
  }

  function faces(v, b) {
    const d = b.d ?? GEOM.depth;
    const x0 = b.x0, x1 = b.x0 + b.w, y0 = b.y0, yt = b.y0 + b.h;
    return {
      top: [v.p(x0, 0, yt), v.p(x1, 0, yt), v.p(x1, d, yt), v.p(x0, d, yt)],
      left: [v.p(x0, d, yt), v.p(x1, d, yt), v.p(x1, d, y0), v.p(x0, d, y0)],
      right: [v.p(x1, 0, yt), v.p(x1, d, yt), v.p(x1, d, y0), v.p(x1, 0, y0)],
      edge: [v.p(x0, d, yt), v.p(x1, d, yt), v.p(x1, 0, yt)],
      hull: [v.p(x0, 0, yt), v.p(x1, 0, yt), v.p(x1, 0, y0), v.p(x1, d, y0), v.p(x0, d, y0), v.p(x0, d, yt)],
    };
  }

  function poly(ctx, pts, close = true) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    if (close) ctx.closePath();
  }

  function bbox(pts) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) {
      if (x < x0) x0 = x; if (y < y0) y0 = y;
      if (x > x1) x1 = x; if (y > y1) y1 = y;
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  function fill(ctx, pts, style, alpha = 1) {
    poly(ctx, pts);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = style;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function sheen(ctx, pts) {
    const b = bbox(pts);
    const g = ctx.createLinearGradient(b.x, b.y, b.x + b.w * 0.8, b.y + b.h);
    g.addColorStop(0, 'rgba(255,255,255,0.32)');
    g.addColorStop(0.65, 'rgba(255,255,255,0)');
    fill(ctx, pts, g);
  }

  function sideShade(ctx, pts) {
    const b = bbox(pts);
    const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
    g.addColorStop(0, 'rgba(255,255,255,0.10)');
    g.addColorStop(1, 'rgba(0,0,0,0.32)');
    fill(ctx, pts, g);
  }

  function glowEllipse(ctx, cx, cy, rx, ry, rgb, alpha) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, `rgba(${rgb},${alpha})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
    ctx.restore();
  }

  // ── Blocks ───────────────────────────────────────────────────────────────────
  /**
   * Draw one block.
   * b    = { x0, w, y0, h, label, d? }   (world units)
   * opts = {
   *   kind:  'cloud' | 'base' | 'active' | 'shard',
   *   t:     0..1 tint position (cloud only),
   *   flash: 0..1 white-flash amount (perfect drop),
   *   cut:   0..1 amber glow on the right face (fresh slice),
   *   cutEdge: 'left' | 'right'  amber outline on that end (shards),
   *   alpha: overall opacity
   * }
   */
  function drawBlock(ctx, v, b, opts = {}) {
    const kind = opts.kind || 'cloud';
    const k = v.k;
    const f = faces(v, b);
    const d = b.d ?? GEOM.depth;
    const pal = kind === 'base' ? COLORS.base
      : kind === 'active' ? COLORS.active
      : kind === 'shard' ? COLORS.shard
      : tint(opts.t ?? 1);
    const flash = opts.flash || 0;

    ctx.save();
    if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
    const baseAlpha = ctx.globalAlpha;

    // Soft outer glow for the active / flashing block.
    if (kind === 'active' || flash > 0) {
      ctx.save();
      ctx.shadowColor = flash > 0 ? `rgba(255,255,255,${0.8 * flash})` : 'rgba(91,227,255,0.55)';
      ctx.shadowBlur = (flash > 0 ? 28 : 18) * k;
      poly(ctx, f.hull);
      ctx.fillStyle = pal.top;
      ctx.fill();
      ctx.restore();
    }

    const fa = (pts, style, a = 1) => fill(ctx, pts, style, a * baseAlpha);

    fa(f.left, pal.left);
    ctx.globalAlpha = baseAlpha; sideShade(ctx, f.left);
    fa(f.right, pal.right);
    fa(f.top, pal.top);
    ctx.globalAlpha = baseAlpha; sheen(ctx, f.top);

    // Fresh-cut face (kept block after a slice): amber gradient on the right face.
    if (opts.cut > 0) {
      const bb = bbox(f.right);
      const g = ctx.createLinearGradient(0, bb.y, 0, bb.y + bb.h);
      g.addColorStop(0, '#FFD58A');
      g.addColorStop(1, '#E07A12');
      fa(f.right, g, opts.cut);
    }

    // Perfect flash: wash faces toward white.
    if (flash > 0) {
      fa(f.top, '#FFFFFF', flash);
      fa(f.left, 'hsl(198,85%,80%)', flash);
      fa(f.right, 'hsl(202,70%,60%)', flash);
    }

    // Neon edge along the two front top edges.
    ctx.save();
    ctx.globalAlpha = baseAlpha * (kind === 'cloud' ? pal.edgeAlpha : 1);
    poly(ctx, f.edge, false);
    ctx.lineJoin = 'round';
    if (kind === 'base') {
      ctx.strokeStyle = pal.edge;
      ctx.lineWidth = 1 * k;
    } else if (kind !== 'shard') {
      ctx.shadowColor = 'rgba(91,227,255,0.9)';
      ctx.shadowBlur = 6 * k;
      ctx.strokeStyle = flash > 0 ? '#FFFFFF' : pal.edge;
      ctx.lineWidth = (kind === 'active' ? 1.4 : 1.2) * k;
    }
    if (kind !== 'shard') ctx.stroke();
    ctx.restore();

    // Shard cut outline (amber).
    if (opts.cutEdge) {
      const x = opts.cutEdge === 'left' ? b.x0 : b.x0 + b.w;
      const yt = b.y0 + b.h;
      ctx.save();
      ctx.globalAlpha = baseAlpha;
      poly(ctx, [v.p(x, 0, yt), v.p(x, d, yt), v.p(x, d, b.y0)], false);
      ctx.strokeStyle = COLORS.amber;
      ctx.lineWidth = 1.4 * k;
      ctx.shadowColor = 'rgba(255,178,63,0.95)';
      ctx.shadowBlur = 8 * k;
      ctx.stroke();
      ctx.restore();
    }

    // Base: vent slots.
    if (kind === 'base') {
      ctx.save();
      ctx.strokeStyle = '#0B0F17';
      ctx.lineWidth = 2 * k;
      ctx.lineCap = 'round';
      for (let r = 0; r < 4; r++) {
        const a = v.p(b.x0 + b.w * 0.66, d, b.y0 + 12 + r * 7);
        const c = v.p(b.x0 + b.w * 0.88, d, b.y0 + 12 + r * 7);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); ctx.stroke();
      }
      ctx.restore();
    }

    // LEDs only on blocks wide enough to spare the room; narrower blocks give it to the label.
    const showLeds = kind !== 'shard' && b.w >= LABEL_FIT.ledMinWidth;

    // Label, printed on the long (left) face, skewed into isometric, fitted to the face.
    if (b.label && kind !== 'shard') {
      const weight = flash > 0.5 ? 600 : 500;
      const fit = fitLabel(ctx, b, showLeds, weight);
      if (fit) {
        const la = v.p(b.x0 + LABEL_FIT.inset, d, b.y0 + b.h / 2 - fit.size * 0.4);
        ctx.save();
        poly(ctx, f.left);   // safety net: never paint outside the face
        ctx.clip();
        ctx.translate(la[0], la[1]);
        ctx.transform(COS * k, SIN * k, 0, k, 0, 0);
        ctx.font = `${weight} ${fit.size}px ${MONO}`;
        if ('letterSpacing' in ctx) ctx.letterSpacing = `${fit.spacing}px`;
        ctx.fillStyle = flash > 0.5 ? '#0A2A55' : kind === 'base' ? pal.label : 'rgba(240,248,255,0.9)';
        ctx.globalAlpha = baseAlpha;
        ctx.fillText(fit.text, 0, 0);
        ctx.restore();
      }
    }

    // Status LEDs near the right end of the label face.
    if (showLeds) {
      const mid = b.y0 + b.h / 2;
      const d1 = v.p(b.x0 + b.w - 11, d, mid);
      const d2 = v.p(b.x0 + b.w - 18, d, mid);
      ctx.save();
      ctx.globalAlpha = baseAlpha;
      ctx.fillStyle = kind === 'base' ? COLORS.amber : kind === 'active' ? COLORS.ice : COLORS.led;
      ctx.beginPath(); ctx.arc(d1[0], d1[1], 1.5 * k, 0, Math.PI * 2); ctx.fill();
      if (kind === 'cloud') {
        ctx.globalAlpha = baseAlpha * 0.4;
        ctx.beginPath(); ctx.arc(d2[0], d2[1], 1.5 * k, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    ctx.restore();
  }

  /** Shadow of the sliding block on the stack top + dashed drop rails. */
  function drawDropGuide(ctx, v, top, active) {
    const d = GEOM.depth;
    const yt = top.y0 + top.h;
    const a0 = Math.max(active.x0, top.x0);
    const a1 = Math.min(active.x0 + active.w, top.x0 + top.w);
    ctx.save();
    if (a1 > a0) {
      fill(ctx, [v.p(a0, 0, yt), v.p(a1, 0, yt), v.p(a1, d, yt), v.p(a0, d, yt)], '#00081C', 0.42);
    }
    ctx.setLineDash([2 * v.k, 3 * v.k]);
    ctx.strokeStyle = 'rgba(91,227,255,0.6)';
    ctx.lineWidth = 1 * v.k;
    for (const x of [active.x0, active.x0 + active.w]) {
      const p1 = v.p(x, d, active.y0), p2 = v.p(x, d, yt);
      ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
    }
    ctx.restore();
  }

  /** Motion trail behind the sliding block. dir = +1 moving toward +x, -1 toward -x. */
  function drawTrail(ctx, v, active, dir) {
    for (const [off, aTop, aLeft] of [[28, 0.05, 0.04], [14, 0.10, 0.08]]) {
      const g = { ...active, x0: active.x0 - off * dir };
      const f = faces(v, g);
      fill(ctx, f.top, '#8FE6FF', aTop);
      fill(ctx, f.left, '#8FE6FF', aLeft);
    }
  }

  // ── Effects ──────────────────────────────────────────────────────────────────
  /** Perfect-drop rings. p = 0..1 progress over ~600 ms. */
  function drawPerfectRings(ctx, v, b, p) {
    const d = GEOM.depth, yt = b.y0 + b.h;
    const ring = (e, color, width, alpha) => {
      const pts = [v.p(b.x0 - e, -e, yt), v.p(b.x0 + b.w + e, -e, yt), v.p(b.x0 + b.w + e, d + e, yt), v.p(b.x0 - e, d + e, yt)];
      ctx.save();
      ctx.globalAlpha = alpha;
      poly(ctx, pts);
      ctx.strokeStyle = color;
      ctx.lineWidth = width * v.k;
      ctx.stroke();
      ctx.restore();
    };
    const e = easeOut(p);
    ring(lerp(6, 30, e), '#FFFFFF', 1.6, 1 - p);
    const p2 = clamp((p - 0.2) / 0.8, 0, 1);
    if (p2 > 0) ring(lerp(14, 52, easeOut(p2)), COLORS.cyan, 1.2, (1 - p2) * 0.9);
  }

  /** Amber slice line. p = 0..1 over ~250 ms (fades out). x = cut position. */
  function drawCutLine(ctx, v, x, y0, h, p) {
    const d = GEOM.depth, yt = y0 + h;
    ctx.save();
    ctx.globalAlpha = 1 - p;
    ctx.strokeStyle = COLORS.amberLight;
    ctx.lineWidth = 1.6 * v.k;
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(255,178,63,0.95)';
    ctx.shadowBlur = 10 * v.k;
    const a = v.p(x, -18, yt), b = v.p(x, d + 18, yt), c = v.p(x, d, yt), e = v.p(x, d, y0 - 8);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.moveTo(c[0], c[1]); ctx.lineTo(e[0], e[1]); ctx.stroke();
    ctx.restore();
  }

  /**
   * Falling shard (sliced overhang or a full missed block).
   * shard = { x0, w, y0, h, side: 'left'|'right' }  — side = which side of the stack it fell off
   * tSec  = seconds since the cut.
   */
  function drawShard(ctx, v, shard, tSec) {
    const c = v.p(shard.x0 + shard.w / 2, GEOM.depth / 2, shard.y0 + shard.h / 2);
    const dir = shard.side === 'left' ? -1 : 1;
    const dx = dir * 70 * tSec * v.k;
    const dy = 0.5 * 1400 * tSec * tSec * v.k;
    const rot = dir * 1.6 * tSec;
    const alpha = clamp(1 - (tSec - 0.6) / 0.5, 0, 1);
    if (alpha <= 0) return false;
    ctx.save();
    ctx.translate(c[0] + dx, c[1] + dy);
    ctx.rotate(rot);
    ctx.translate(-c[0], -c[1]);
    drawBlock(ctx, v, shard, { kind: 'shard', alpha, cutEdge: shard.side === 'left' ? 'right' : 'left' });
    ctx.restore();
    return true;
  }

  /** Screen-shake offset. p = 0..1 over ~300 ms. */
  function shakeOffset(p, k = 1) {
    if (p >= 1) return [0, 0];
    const amp = 6 * k * (1 - p);
    return [Math.sin(p * 60) * amp, Math.cos(p * 47) * amp * 0.5];
  }

  /**
   * Score pop-up. kind: 'perfect' | 'slice'. p = 0..1 over ~900 ms.
   * (x, y) = screen point above the landed block (number baseline).
   * Small Martian Mono label over a big glowing Mulish number.
   */
  function drawPopup(ctx, x, y, kind, p, k = 1) {
    const inT = clamp(p / 0.18, 0, 1);
    const alpha = p < 0.7 ? inT : clamp(1 - (p - 0.7) / 0.3, 0, 1);
    const rise = lerp(16, 0, easeOut(inT)) - Math.max(0, p - 0.7) / 0.3 * 22;
    const perfect = kind === 'perfect';
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${(perfect ? 4.4 : 3.4) * k}px`;
    ctx.font = `600 ${(perfect ? 11 : 10) * k}px ${MONO}`;
    ctx.fillStyle = perfect ? COLORS.cyan : COLORS.amber;
    ctx.fillText(perfect ? 'PERFECT' : 'SLICED', x, y + rise - (perfect ? 50 : 40) * k);
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${-1.2 * k}px`;
    ctx.font = `900 ${(perfect ? 48 : 36) * k}px ${DISPLAY}`;
    ctx.shadowColor = perfect ? 'rgba(91,227,255,0.85)' : 'rgba(255,178,63,0.55)';
    ctx.shadowBlur = (perfect ? 22 : 16) * k;
    ctx.fillStyle = perfect ? '#FFFFFF' : '#FFE2B0';
    ctx.fillText(perfect ? '+500' : '+100', x, y + rise);
    ctx.restore();
  }

  // ── Art layer (Paweł's hand) ────────────────────────────────────────────────
  // Everything here is the "tagged infrastructure" layer: hand-drawn marks on top
  // of the clean corporate render. Palette is deliberately separate from the blues.
  const ART = {
    chalk: '#F2EEE6',
    ink: '#0A0D14',
    pink: '#FF3EA5',
  };

  /**
   * Tint a black-on-transparent drawing (e.g. a scanned × mark) to any colour.
   * Cache the result; don't call per frame.
   */
  function tintSprite(img, color) {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = color;
    x.fillRect(0, 0, c.width, c.height);
    return c;
  }

  /**
   * One hand-drawn-looking × mark. If `sprite` (a canvas from tintSprite or an
   * <img>) is given it is drawn instead of the procedural stand-in.
   */
  function drawXMark(ctx, x, y, size, rot, color, k = 1, sprite = null) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    if (sprite) {
      const s = size * 2.4 * k;
      ctx.drawImage(sprite, -s / 2, -s / 2, s, s);
    } else {
      const s = size * k;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.6, size * 0.42) * k;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-s, -0.9 * s); ctx.quadraticCurveTo(0.12 * s, -0.12 * s, s, s);
      ctx.moveTo(0.95 * s, -s); ctx.quadraticCurveTo(-0.1 * s, 0.12 * s, -0.9 * s, 0.95 * s);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Perfect-drop × burst: 9 marks on an isometric ellipse around the landed block,
   * alternating pink / chalk. p = 0..1 over ~600 ms. sprites = { pink, chalk } (optional, arrays OK).
   */
  function drawPerfectXs(ctx, v, b, p, sprites = null) {
    const c = v.p(b.x0 + b.w / 2, GEOM.depth / 2, b.y0 + b.h);
    const k = v.k;
    const appear = easeOut(clamp(p / 0.25, 0, 1));
    const alpha = p < 0.6 ? 1 : clamp(1 - (p - 0.6) / 0.4, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.4;
      const r = (110 + (i % 3) * 14 + 14 * p) * k;
      const pink = i % 2 === 0;
      const pick = (s) => (Array.isArray(s) ? s[i % s.length] : s);
      const sprite = sprites ? pick(pink ? sprites.pink : sprites.chalk) : null;
      drawXMark(ctx, c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r * 0.55,
        (5 + (i % 3) * 1.6) * appear, (i * 0.7) % 1.2 - 0.6, pink ? ART.pink : ART.chalk, k, sprite);
    }
    ctx.restore();
  }

  /** × marks at the ends of the slice line. p = 0..1 over ~400 ms. */
  function drawCutXs(ctx, v, x, y0, h, p, sprite = null) {
    const d = GEOM.depth, yt = y0 + h;
    const pts = [[v.p(x, -18, yt), 0.2, 4.5], [v.p(x, d + 18, yt), -0.3, 4.5], [v.p(x, d, y0 - 8), 0.1, 4]];
    ctx.save();
    ctx.globalAlpha = clamp(1 - p, 0, 1);
    for (const [pt, rot, size] of pts) drawXMark(ctx, pt[0], pt[1] + (size === 4 ? 6 * v.k : 0), size, rot, ART.chalk, v.k, sprite);
    ctx.restore();
  }

  // ── Background ───────────────────────────────────────────────────────────────
  /** Build the static backdrop once per resize. Returns an offscreen canvas. */
  function buildBackdrop(w, h, k, dpr = 1) {
    const cv = document.createElement('canvas');
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const c = cv.getContext('2d');
    c.scale(dpr, dpr);

    // Night sky.
    const R = Math.max(w, h) * 0.8;
    const sky = c.createRadialGradient(w / 2, h * 0.38, 0, w / 2, h * 0.38, R);
    sky.addColorStop(0, COLORS.navy3);
    sky.addColorStop(0.36, COLORS.navy2);
    sky.addColorStop(0.68, COLORS.navy1);
    sky.addColorStop(1, COLORS.night);
    c.fillStyle = sky;
    c.fillRect(0, 0, w, h);

    // Azure bloom behind the stack.
    glowEllipse(c, w / 2, h * 0.44, Math.min(w, 900) * 0.62, Math.min(h, 700) * 0.42, '0,120,212', 0.55);

    // Faint isometric lattice, faded out radially.
    const tw = 38.1 * k, th = 22 * k;
    const tile = document.createElement('canvas');
    tile.width = Math.ceil(tw); tile.height = Math.ceil(th);
    const tc = tile.getContext('2d');
    tc.strokeStyle = '#6AB4FF';
    tc.lineWidth = 0.5;
    tc.beginPath(); tc.moveTo(0, 0); tc.lineTo(tw, th); tc.moveTo(tw, 0); tc.lineTo(0, th); tc.stroke();
    const lat = document.createElement('canvas');
    lat.width = w; lat.height = h;
    const lc = lat.getContext('2d');
    lc.fillStyle = lc.createPattern(tile, 'repeat');
    lc.fillRect(0, 0, w, h);
    lc.globalCompositeOperation = 'destination-in';
    const fade = lc.createRadialGradient(w / 2, h * 0.38, 0, w / 2, h * 0.38, Math.max(w, h) * 0.62);
    fade.addColorStop(0, 'rgba(255,255,255,1)');
    fade.addColorStop(1, 'rgba(255,255,255,0)');
    lc.fillStyle = fade;
    lc.fillRect(0, 0, w, h);
    c.globalAlpha = 0.09;
    c.drawImage(lat, 0, 0);
    c.globalAlpha = 1;
    return cv;
  }

  /** Grain overlay, built once. Draw with drawGrain() as the very last layer. */
  function buildGrain(size = 160) {
    const cv = document.createElement('canvas');
    cv.width = size; cv.height = size;
    const c = cv.getContext('2d');
    const img = c.createImageData(size, size);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = n;
      img.data[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    return cv;
  }

  function drawGrain(ctx, grain, w, h) {
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = ctx.createPattern(grain, 'repeat');
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  /** Moving atmosphere: drifting haze + light column above the stack top. */
  function drawAtmosphere(ctx, w, h, k, timeSec, stackTopScreenX, stackTopScreenY) {
    const drift = Math.sin(timeSec * (Math.PI * 2) / 28) * 18 * k;
    glowEllipse(ctx, w * 0.12 + drift, h * 0.16, 150 * k, 45 * k, '150,195,255', 0.18);
    glowEllipse(ctx, w * 0.92 - drift, h * 0.33, 165 * k, 50 * k, '150,195,255', 0.14);
    if (w > 900) glowEllipse(ctx, w * 0.5 + drift * 0.6, h * 0.1, 280 * k, 60 * k, '150,195,255', 0.10);
    // Light column rising off the stack.
    glowEllipse(ctx, stackTopScreenX, stackTopScreenY - 150 * k, 125 * k, 230 * k, '91,227,255', 0.16);
  }

  /** Rising light motes. Create once with makeMotes(w, h), draw each frame. */
  function makeMotes(w, h, count) {
    count = count || Math.round((w * h) / 26000);
    const motes = [];
    for (let i = 0; i < count; i++) {
      motes.push({ x: Math.random() * w, y: h * (0.15 + Math.random() * 0.75), r: 0.7 + Math.random() * 0.6, period: 9 + Math.random() * 5, phase: Math.random() });
    }
    return motes;
  }

  function drawMotes(ctx, motes, timeSec, k = 1) {
    ctx.save();
    ctx.fillStyle = '#BFEFFF';
    for (const m of motes) {
      const p = (timeSec / m.period + m.phase) % 1;
      ctx.globalAlpha = p < 0.15 ? (p / 0.15) * 0.9 : (1 - p) * 0.9 / 0.85;
      ctx.beginPath();
      ctx.arc(m.x, m.y - p * 170 * k, m.r * k, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Darkening fog at the bottom of the screen (stack fades into it). */
  function drawFog(ctx, w, h, k = 1) {
    const fh = 220 * k;
    const g = ctx.createLinearGradient(0, h - fh, 0, h);
    g.addColorStop(0, 'rgba(2,6,15,0)');
    g.addColorStop(0.55, 'rgba(2,6,15,0.75)');
    g.addColorStop(1, COLORS.night);
    ctx.fillStyle = g;
    ctx.fillRect(0, h - fh, w, fh);
  }

  /**
   * Floor grid + landing pad under the on-prem base (visible on the title screen
   * and early in a run). Build once per resize with buildFloor(k, dpr), then
   * drawFloor(ctx, floor, view) every frame — it follows the camera.
   */
  function buildFloor(k, dpr = 1) {
    const W = Math.ceil(760 * k), H = Math.ceil(440 * k);
    const cv = document.createElement('canvas');
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    const d = GEOM.depth, bw = GEOM.baseW;
    const v = makeView(0, 0, k);
    const cx0 = v.p(bw / 2, d / 2, 0);
    v.ox = W / 2 - cx0[0];
    v.oy = H / 2 - cx0[1];
    const c = v.p(bw / 2, d / 2, 0);
    glowEllipse(ctx, c[0], c[1], 180 * k, 75 * k, '0,120,212', 0.45);
    const w = W, h = H;
    // Grid, masked by an elliptical fade.
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const oc = off.getContext('2d');
    oc.strokeStyle = '#4FA6FF';
    oc.lineWidth = 0.7;
    oc.beginPath();
    for (let i = -10; i <= 16; i++) {
      const g = i * 22;
      let a = v.p(-220, g, 0), b = v.p(420, g, 0);
      oc.moveTo(a[0], a[1]); oc.lineTo(b[0], b[1]);
      a = v.p(g, -260, 0); b = v.p(g, 380, 0);
      oc.moveTo(a[0], a[1]); oc.lineTo(b[0], b[1]);
    }
    oc.stroke();
    oc.globalCompositeOperation = 'destination-in';
    oc.save();
    oc.translate(c[0], c[1]);
    oc.scale(1, 0.55);
    const fg = oc.createRadialGradient(0, 0, 0, 0, 0, 250 * k);
    fg.addColorStop(0, 'rgba(255,255,255,1)');
    fg.addColorStop(0.55, 'rgba(255,255,255,0.45)');
    fg.addColorStop(1, 'rgba(255,255,255,0)');
    oc.fillStyle = fg;
    oc.fillRect(-250 * k, -250 * k, 500 * k, 500 * k);
    oc.restore();
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.drawImage(off, 0, 0, w, h);
    ctx.restore();
    // Pad outlines.
    for (const [e, a] of [[14, 0.45], [34, 0.18]]) {
      ctx.save();
      ctx.globalAlpha = a;
      poly(ctx, [v.p(-e, -e, 0), v.p(bw + e, -e, 0), v.p(bw + e, d + e, 0), v.p(-e, d + e, 0)]);
      ctx.strokeStyle = COLORS.cyan;
      ctx.lineWidth = 1 * k;
      ctx.stroke();
      ctx.restore();
    }
    return { canvas: cv, ox: v.ox, oy: v.oy, w: W, h: H };
  }

  function drawFloor(ctx, floor, v) {
    ctx.drawImage(floor.canvas, v.ox - floor.ox, v.oy - floor.oy, floor.w, floor.h);
  }

  global.StackRenderer = {
    COLORS, GEOM, MONO, DISPLAY, LABEL_FIT, SHORT_LABELS, fitLabel,
    ART, tintSprite, drawXMark, drawPerfectXs, drawCutXs,
    scaleFor, makeView, centredOriginX, tint,
    drawBlock, drawDropGuide, drawTrail,
    drawPerfectRings, drawCutLine, drawShard, shakeOffset, drawPopup,
    buildBackdrop, buildGrain, drawGrain, drawAtmosphere, makeMotes, drawMotes, drawFog, buildFloor, drawFloor,
  };
})(typeof window !== 'undefined' ? window : globalThis);
