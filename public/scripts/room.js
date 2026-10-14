// The night studio with live screens and blinking city lights, on one canvas that covers its container.
// tools/prepare-assets.py finds the screens and lights in the picture ahead of time (room-data.js,
// room-masks.png), so here the browser only draws. Each tick it repaints just the four screens and one
// light; it stops while the scene is off-screen or the tab is hidden, and stays still for reduced motion.
// mount(container) fills the container; the CSS decides the frame (object-fit on the canvas).
import ROOM from "./room-data.js";
import { t3code, ghostty, posthog, devlog } from "./room-screens.js";

const TICK_MS = 150;
const FONT = '"IBM Plex Mono", ui-monospace, monospace';
// Behind each app, in the sliver of screen its window doesn't cover.
const SCREEN_BG = "#0e0c14";

function loadImage(path) {
  const img = new Image();
  img.src = new URL(path, import.meta.url).href;
  return img.decode().then(() => img);
}

function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

// Maps the unit square onto a quad [top-left, top-right, bottom-right, bottom-left] in perspective.
function homography([[x0, y0], [x1, y1], [x2, y2], [x3, y3]]) {
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / den, h = (dx1 * dy3 - dx3 * dy1) / den;
  const a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, d = y1 - y0 + g * y1, e = y3 - y0 + h * y3;
  return (u, v) => {
    const z = g * u + h * v + 1;
    return [(a * u + b * v + x0) / z, (d * u + e * v + y0) / z];
  };
}

// Canvas has no perspective transform, so the flat content is drawn as a grid of triangles, each with its
// own affine transform. The grid and its transforms depend only on the screen's shape, so they're built once.
const GRID = 6;
function warpPlan(fw, fh, quad) {
  const project = homography(quad);
  const plan = [];
  const triangle = (src, dst) => {
    const [[sx0, sy0], [sx1, sy1], [sx2, sy2]] = src, [[dx0, dy0], [dx1, dy1], [dx2, dy2]] = dst;
    const den = (sx1 - sx0) * (sy2 - sy0) - (sx2 - sx0) * (sy1 - sy0);
    const a = ((dx1 - dx0) * (sy2 - sy0) - (dx2 - dx0) * (sy1 - sy0)) / den;
    const c = ((dx2 - dx0) * (sx1 - sx0) - (dx1 - dx0) * (sx2 - sx0)) / den;
    const b = ((dy1 - dy0) * (sy2 - sy0) - (dy2 - dy0) * (sy1 - sy0)) / den;
    const d = ((dy2 - dy0) * (sx1 - sx0) - (dy1 - dy0) * (sx2 - sx0)) / den;
    // Each clip is pushed out half a pixel from its centre so neighbouring triangles overlap instead of leaving hairlines.
    const cx = (dx0 + dx1 + dx2) / 3, cy = (dy0 + dy1 + dy2) / 3;
    const clip = new Path2D();
    dst.forEach(([x, y], k) => {
      const l = Math.hypot(x - cx, y - cy) || 1;
      const p = [x + ((x - cx) / l) * 0.6, y + ((y - cy) / l) * 0.6];
      k ? clip.lineTo(...p) : clip.moveTo(...p);
    });
    plan.push({ clip, transform: [a, b, c, d, dx0 - a * sx0 - c * sy0, dy0 - b * sx0 - d * sy0] });
  };
  for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
    const u0 = i / GRID, u1 = (i + 1) / GRID, v0 = j / GRID, v1 = (j + 1) / GRID;
    const s = [[u0 * fw, v0 * fh], [u1 * fw, v0 * fh], [u1 * fw, v1 * fh], [u0 * fw, v1 * fh]];
    const d = [project(u0, v0), project(u1, v0), project(u1, v1), project(u0, v1)];
    triangle([s[0], s[1], s[2]], [d[0], d[1], d[2]]);
    triangle([s[0], s[2], s[3]], [d[0], d[2], d[3]]);
  }
  return plan;
}

// A screen: its app draws flat, the flat frame is warped onto the screen's corners, and the mask keeps
// only the screen's own pixels, so the man's head stays in front of the middle monitor.
function makeScreen({ x, y, w, h, maskY, quad }, masks, program) {
  const side = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1]);
  const flat = canvas(Math.round((side(quad[0], quad[1]) + side(quad[3], quad[2])) / 2), Math.round((side(quad[0], quad[3]) + side(quad[1], quad[2])) / 2));
  const mask = canvas(w, h);
  mask.getContext("2d").drawImage(masks, 0, maskY, w, h, 0, 0, w, h);
  const layer = canvas(w, h);
  const plan = warpPlan(flat.width, flat.height, quad);
  const f = flat.getContext("2d");
  const g = layer.getContext("2d");
  return {
    advance: () => program(f, flat.width, flat.height),
    draw(ctx, picture) {
      f.fillStyle = SCREEN_BG;
      f.fillRect(0, 0, flat.width, flat.height);
      program(f, flat.width, flat.height);
      g.globalCompositeOperation = "source-over";
      g.fillStyle = SCREEN_BG;
      g.fillRect(0, 0, w, h);
      for (const { clip, transform } of plan) {
        g.save();
        g.clip(clip);
        g.setTransform(...transform);
        g.drawImage(flat, 0, 0);
        g.restore();
      }
      g.globalCompositeOperation = "destination-in";
      g.drawImage(mask, 0, 0);
      // The mask's soft edge is semi-transparent, so the picture is restored first to keep it from building up.
      ctx.drawImage(picture, x, y, w, h, x, y, w, h);
      ctx.drawImage(layer, x, y);
    },
  };
}

export default function mount(container) {
  const view = canvas(ROOM.width, ROOM.height);
  container.appendChild(view);
  const ctx = view.getContext("2d");

  Promise.all([
    loadImage("../assets/room.webp"),
    loadImage("../assets/room-masks.png"),
    document.fonts.load(`500 11px ${FONT}`),
    document.fonts.load(`600 11px ${FONT}`),
  ]).then(([picture, masks]) => {
    const programs = [t3code(), ghostty(), posthog(), devlog()];
    const screens = ROOM.screens.map((s, k) => makeScreen(s, masks, programs[k]));
    // Start mid-task rather than on empty screens.
    for (let k = 0; k < 60; k++) for (const s of screens) s.advance();
    ctx.drawImage(picture, 0, 0);
    for (const s of screens) s.draw(ctx, picture);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const unlit = new Set();
    const tick = () => {
      const light = ROOM.lights[Math.floor(Math.random() * ROOM.lights.length)];
      const [x, y, w, h] = light;
      if (unlit.delete(light)) ctx.drawImage(picture, x, y, w, h, x, y, w, h);
      else {
        unlit.add(light);
        ctx.fillStyle = "#000";
        ctx.fillRect(x, y, w, h);
      }
      for (const s of screens) s.draw(ctx, picture);
    };
    let timer = 0, visible = false;
    const update = () => {
      const run = visible && !document.hidden;
      if (run && !timer) timer = setInterval(tick, TICK_MS);
      if (!run && timer) { clearInterval(timer); timer = 0; }
    };
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); }).observe(container);
    document.addEventListener("visibilitychange", update);
  });
}
