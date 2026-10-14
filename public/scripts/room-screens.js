// The apps on the studio's screens (scripts/room.js), drawn as tiny but realistic UIs with generic tech
// content. Each export makes a program; calling it advances one tick and draws a full frame into a w x h
// canvas context:
//   t3code   a T3 Code (Nightly) window: thread sidebar, an agent turn streaming in, the composer
//   ghostty  a Ghostty window split into three coding agents mid-task
//   posthog  a PostHog-style dashboard: nav, number tiles, an area chart and a bar chart
//   devlog   a terminal tailing a dev server

const SANS = '-apple-system, "SF Pro Text", "Inter", system-ui, sans-serif';
const MONO = '"IBM Plex Mono", ui-monospace, monospace';
const K = {
  window: "#0e0c14", panel: "#15121e", line: "#272235", text: "#e6e0f2", soft: "#a79fba", dim: "#6c6480",
  accent: "#b48cff", yellow: "#f0c850", green: "#6fd08c", red: "#f07a7a", blue: "#7aa7ff", orange: "#e8915a",
};

const pick = (list) => list[Math.floor(Math.random() * list.length)];
function write(g, s, x, y, color, size, font = SANS, weight = 400) {
  g.font = `${weight} ${size}px ${font}`;
  g.fillStyle = color;
  g.fillText(s, x, y);
  return g.measureText(s).width;
}
function fit(g, s, max) {
  while (s.length > 1 && g.measureText(s).width > max) s = s.slice(0, -1);
  return s;
}
function round(g, x, y, w, h, r, color) {
  g.fillStyle = color;
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  g.fill();
}
function titlebar(g, w, title) {
  g.fillStyle = K.panel;
  g.fillRect(0, 0, w, 11);
  ["#ff5f57", "#febc2e", "#28c840"].forEach((c, k) => { g.fillStyle = c; g.beginPath(); g.arc(6 + k * 7, 5.5, 2.2, 0, Math.PI * 2); g.fill(); });
  write(g, title, 30, 8, K.soft, 6, SANS, 600);
}
// A smooth line through points, for charts.
function curve(g, pts) {
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
    g.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
  }
  g.lineTo(...pts[pts.length - 1]);
}

// T3 Code: an agent works through a request, its reply and tool calls streaming in.
const TURNS = [
  { ask: "Add rate limiting to the public API", reply: "I'll add a token bucket per API key and return 429 with a Retry-After header.", tools: [["Read", "src/server/middleware.ts"], ["Edit", "src/server/ratelimit.ts", "+64 -0"], ["Edit", "src/server/middleware.ts", "+6 -1"], ["Ran", "bun test ratelimit", "12 passed"]] },
  { ask: "Why is the checkout test flaky?", reply: "The test reads the cart before the write commits. I'll await the mutation and drop the sleep.", tools: [["Read", "tests/checkout.test.ts"], ["Search", "\"waitFor(\""], ["Edit", "tests/checkout.test.ts", "+4 -7"], ["Ran", "bun test checkout --repeat 50", "50 passed"]] },
  { ask: "Move sessions from Redis to Postgres", reply: "Sessions get their own table with an expiry index; reads go through the existing repo layer.", tools: [["Read", "src/auth/session.ts"], ["Edit", "db/migrations/0042_sessions.sql", "+18 -0"], ["Edit", "src/auth/session.ts", "+31 -44"], ["Ran", "bun run typecheck", "no errors"]] },
];
export function t3code() {
  let turn = 0, chars = 0, tools = 0, wait = 0;
  return (g, w, h) => {
    const t = TURNS[turn % TURNS.length];
    if (wait > 0) wait--;
    else if (chars < t.reply.length) chars += 3;
    else if (tools < t.tools.length) { tools++; wait = 6; }
    else { turn++; chars = 0; tools = 0; wait = 18; }
    g.fillStyle = K.window;
    g.fillRect(0, 0, w, h);
    titlebar(g, w, "T3 Code (Nightly)");
    const side = Math.round(w * 0.3);
    g.fillStyle = K.panel;
    g.fillRect(0, 11, side, h - 11);
    round(g, 4, 15, side - 8, 9, 3, K.line);
    write(g, "Search", 8, 21.5, K.dim, 5.5);
    write(g, "api", 6, 33, K.dim, 5, SANS, 600);
    TURNS.concat([{ ask: "Dark mode for settings" }, { ask: "Upgrade to React 20" }]).forEach((th, k) => {
      const y = 38 + k * 13, active = k === turn % TURNS.length;
      if (active) round(g, 3, y, side - 6, 11, 3, K.line);
      g.font = `400 5.5px ${SANS}`;
      write(g, fit(g, th.ask, side - 16), 7, y + 7.5, active ? K.text : K.soft, 5.5);
      if (active) { g.fillStyle = K.accent; g.beginPath(); g.arc(side - 7, y + 5.5, 1.6, 0, Math.PI * 2); g.fill(); }
    });
    // Conversation.
    const x0 = side + 8, cw = w - side - 16;
    g.font = `600 6.5px ${SANS}`;
    write(g, fit(g, t.ask, cw), x0, 21, K.text, 6.5, SANS, 600);
    g.fillStyle = K.line;
    g.fillRect(side, 25, w - side, 0.6);
    g.font = `500 5.5px ${SANS}`;
    const askW = Math.min(cw * 0.8, g.measureText(t.ask).width + 10);
    round(g, w - 8 - askW, 30, askW, 11, 4, "#2a2240");
    write(g, fit(g, t.ask, askW - 8), w - 4 - askW, 37.5, K.text, 5.5);
    // The reply wraps across lines as it streams.
    const words = t.reply.slice(0, chars).split(" ");
    let line = "", y = 52;
    g.font = `400 5.5px ${SANS}`;
    for (const word of words) {
      if (g.measureText(line + word).width > cw) { write(g, line, x0, y, K.text, 5.5); line = ""; y += 8; }
      line += word + " ";
    }
    write(g, line, x0, y, K.text, 5.5);
    y += 8;
    t.tools.slice(0, tools).forEach(([verb, target, result]) => {
      round(g, x0, y, cw, 10, 3, K.panel);
      const vw = write(g, verb, x0 + 4, y + 7, K.soft, 5.5, SANS, 600);
      g.font = `400 5.5px ${MONO}`;
      write(g, fit(g, target, cw - vw - 40), x0 + 8 + vw, y + 7, K.text, 5.5, MONO);
      if (result) write(g, result, x0 + cw - 4 - g.measureText(result).width, y + 7, /-\d/.test(result) && !/^\+/.test(result) ? K.red : K.green, 5.5, MONO);
      y += 12;
    });
    if (chars >= t.reply.length && tools < t.tools.length) write(g, `Working… ${Math.floor(performance.now() / 1000) % 40}s`, x0, y + 6, K.dim, 5.5);
    // Composer.
    round(g, x0 - 2, h - 26, cw + 4, 21, 5, K.panel);
    write(g, "Ask anything…", x0 + 3, h - 16, K.dim, 5.5);
    write(g, "Opus · High", x0 + 3, h - 8.5, K.soft, 5);
    g.fillStyle = K.accent;
    g.beginPath();
    g.arc(x0 + cw - 6, h - 12, 4, 0, Math.PI * 2);
    g.fill();
  };
}

// Ghostty with three agents side by side, each streaming its own work.
const PANES = [
  { head: [["✳ Claude Code", K.orange]], spin: "✻ Thinking…", events: [
    ["● Read(src/queue/worker.ts)", K.text], ["  ⎿ Read 214 lines", K.dim], ["● Update(src/queue/worker.ts)", K.text],
    ["  - await sleep(1000)", K.red], ["  + await job.heartbeat()", K.green], ["  + if (job.expired) return retry(job)", K.green],
    ["● Bash(bun test queue)", K.text], ["  ⎿ 31 pass, 0 fail", K.green], ["● Grep(\"retry(\" in src/)", K.text], ["  ⎿ Found 6 files", K.dim]] },
  { head: [[">_ Codex", K.text]], spin: "• Working", events: [
    ["• Explored", K.text], ["  └ Read schema.prisma", K.dim], ["  └ Search orders.*status", K.dim], ["• Edited src/orders/state.ts (+22 -9)", K.text],
    ["  22 + case \"refunded\":", K.green], ["  23 + return archive(order)", K.green], ["• Ran bun run typecheck", K.text], ["  └ no errors", K.green]] },
  { head: [["opencode", K.text]], spin: "▣ Build", events: [
    ["→ Read src/api/routes.ts", K.soft], ["→ Edit src/api/routes.ts", K.soft], ["  +12 -3", K.green], ["→ Write src/api/health.ts", K.soft],
    ["$ curl -s localhost:3000/health", K.text], ["  {\"ok\":true,\"db\":\"up\"}", K.green], ["→ Read docs/api.md", K.soft], ["→ Edit docs/api.md  +8 -1", K.soft]] },
];
export function ghostty() {
  const panes = PANES.map((p) => ({ ...p, shown: [], next: 0, wait: Math.floor(Math.random() * 8) }));
  // Start mid-task, not on empty screens.
  for (const p of panes) for (let k = 0; k < 6; k++) p.shown.push(p.events[p.next++ % p.events.length]);
  return (g, w, h) => {
    g.fillStyle = "#0b0a10";
    g.fillRect(0, 0, w, h);
    titlebar(g, w, "ghostty");
    const pw = w / panes.length, lh = 7.5;
    panes.forEach((p, k) => {
      if (--p.wait <= 0) { p.shown.push(p.events[p.next++ % p.events.length]); p.wait = 4 + Math.floor(Math.random() * 10); }
      const x = k * pw + 4, rows = Math.floor((h - 44) / lh);
      if (k) { g.fillStyle = K.line; g.fillRect(k * pw, 11, 0.8, h - 11); }
      g.font = `600 5.5px ${MONO}`;
      write(g, p.head[0][0], x, 21, p.head[0][1], 5.5, MONO, 600);
      p.shown.slice(-rows).forEach(([s, c], r) => {
        g.font = `400 5px ${MONO}`;
        write(g, fit(g, s, pw - 8), x, 31 + r * lh, c, 5, MONO);
      });
      write(g, `${p.spin} ${Math.floor(performance.now() / 1000 + k * 7) % 60}s`, x, h - 19, K.yellow, 5, MONO);
      g.fillStyle = K.line;
      g.fillRect(k * pw + 3, h - 14, pw - 6, 0.6);
      write(g, "›", x, h - 6, K.soft, 5.5, MONO);
    });
  };
}

// A product dashboard: numbers, a two-series area chart and a bar chart that update as data arrives.
export function posthog() {
  const walk = (n, start, step) => { let v = start; return Array.from({ length: n }, () => (v = Math.max(5, v + (Math.random() - 0.48) * step))); };
  const views = walk(30, 60, 14), signups = walk(30, 22, 7);
  const routes = [["/api/search", 0.9], ["/api/orders", 0.7], ["/api/auth", 0.55], ["/api/files", 0.4], ["/api/users", 0.3]];
  let tick = 0, users = 11240;
  return (g, w, h) => {
    if (++tick % 10 === 0) {
      views.shift(); views.push(Math.max(5, views[views.length - 1] + (Math.random() - 0.48) * 14));
      signups.shift(); signups.push(Math.max(5, signups[signups.length - 1] + (Math.random() - 0.48) * 7));
      users += Math.round((Math.random() - 0.4) * 30);
      for (const r of routes) r[1] = Math.min(1, Math.max(0.15, r[1] + (Math.random() - 0.5) * 0.08));
    }
    g.fillStyle = "#101014";
    g.fillRect(0, 0, w, h);
    titlebar(g, w, "Product health · PostHog");
    const nav = Math.round(w * 0.2);
    g.fillStyle = K.panel;
    g.fillRect(0, 11, nav, h - 11);
    ["Home", "Dashboards", "Insights", "Replay", "Flags", "Errors", "Logs"].forEach((s, k) => {
      if (k === 1) round(g, 3, 15 + k * 10, nav - 6, 9, 2, K.line);
      g.fillStyle = [K.accent, K.yellow, K.blue, K.orange, K.green, K.red, K.soft][k];
      g.fillRect(6, 18 + k * 10, 3, 3);
      write(g, s, 12, 21.5 + k * 10, k === 1 ? K.text : K.soft, 5);
    });
    const x0 = nav + 5, cw = w - nav - 10;
    write(g, "Product health", x0, 22, K.text, 7, SANS, 700);
    round(g, w - 30, 15, 25, 9, 2, K.yellow);
    write(g, "+ Add", w - 26, 21.5, "#1a1405", 5, SANS, 700);
    // Number tiles.
    const tiles = [["Active users · 24h", users.toLocaleString("en")], ["Signups · 7d", Math.round(signups.reduce((a, b) => a + b, 0) * 3).toLocaleString("en")], ["Error rate", `${(0.4 + Math.random() * 0.05).toFixed(2)}%`]];
    const tw = (cw - 8) / 3;
    tiles.forEach(([label, value], k) => {
      const x = x0 + k * (tw + 4);
      round(g, x, 28, tw, 30, 3, K.panel);
      g.font = `500 4.8px ${SANS}`;
      write(g, fit(g, label, tw - 6), x + 4, 36, K.soft, 4.8, SANS, 500);
      write(g, value, x + 4, 51, K.text, 11, SANS, 700);
    });
    // Area chart.
    const cy = 62, ch = (h - cy - 6) * 0.58;
    round(g, x0, cy, cw, ch, 3, K.panel);
    write(g, "Pageviews & signups · 30 days", x0 + 4, cy + 8, K.text, 5, SANS, 600);
    const top = cy + 14, bottom = cy + ch - 9, left = x0 + 12, right = x0 + cw - 5;
    g.strokeStyle = K.line;
    g.lineWidth = 0.5;
    for (let k = 0; k < 4; k++) { const y = top + (k * (bottom - top)) / 3; g.beginPath(); g.moveTo(left, y); g.lineTo(right, y); g.stroke(); }
    const hi = Math.max(...views) * 1.1;
    [[views, K.accent], [signups, K.blue]].forEach(([series, color]) => {
      const pts = series.map((v, i) => [left + (i / (series.length - 1)) * (right - left), bottom - (v / hi) * (bottom - top)]);
      g.beginPath(); curve(g, pts); g.lineTo(right, bottom); g.lineTo(left, bottom); g.closePath();
      g.globalAlpha = 0.35; g.fillStyle = color; g.fill(); g.globalAlpha = 1;
      g.beginPath(); curve(g, pts); g.strokeStyle = color; g.lineWidth = 0.9; g.stroke();
    });
    ["Sep 15", "Sep 29", "Oct 13"].forEach((s, k) => write(g, s, left + k * ((right - left) / 2) - (k ? 10 : 0), cy + ch - 2.5, K.dim, 4));
    // Bar chart.
    const by = cy + ch + 4, bh = h - by - 5;
    round(g, x0, by, cw, bh, 3, K.panel);
    write(g, "Requests by route · 24h", x0 + 4, by + 8, K.text, 5, SANS, 600);
    routes.forEach(([route, v], k) => {
      const y = by + 13 + k * ((bh - 16) / routes.length);
      write(g, route, x0 + 4, y + 4, K.soft, 4.5, MONO);
      g.fillStyle = [K.accent, K.blue, K.green, K.yellow, K.orange][k];
      g.fillRect(x0 + 44, y, (cw - 52) * v, 4);
    });
  };
}

// A dev server's request log.
export function devlog() {
  const ROUTES = ["GET /api/health 200", "GET /api/search?q=k 200", "POST /api/orders 201", "GET /dashboard 200", "POST /api/auth/refresh 200", "GET /api/files/42 304"];
  const lines = [["$ bun run dev", K.text], ["  ready on http://localhost:3000", K.green]];
  let tick = 0;
  return (g, w, h) => {
    if (++tick % 5 === 0) lines.push([`  ${pick(ROUTES)} ${2 + Math.floor(Math.random() * 40)}ms`, K.soft]);
    g.fillStyle = "#0b0a10";
    g.fillRect(0, 0, w, h);
    const rows = Math.floor((h - 8) / 8);
    lines.slice(-rows).forEach(([s, c], r) => {
      g.font = `400 5.5px ${MONO}`;
      write(g, fit(g, s, w - 8), 4, 10 + r * 8, c, 5.5, MONO);
    });
  };
}
