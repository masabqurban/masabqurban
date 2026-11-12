// Generates an animated "growing snake" SVG from a GitHub contribution calendar.
// The snake sweeps the grid column by column, eats every day with contributions
// and grows one segment for every GROW_EVERY days it eats.
//
// Usage: node scripts/growing-snake.mjs <username> <outDir> [calendar.html]

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const [user, outDir = "dist", localHtml] = process.argv.slice(2);
if (!user) throw new Error("usage: growing-snake.mjs <username> <outDir> [calendar.html]");

const CELL = 12; // grid pitch
const SIZE = 10; // cell size
const PAD = 12;
const STEP = 0.1; // seconds per cell
const START_LEN = 3;
const GROW_EVERY = 4; // +1 segment per N days eaten

const THEMES = {
  light: {
    file: "growing-snake.svg",
    levels: ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"],
    head: "#1e3a8a",
    body: ["#2563eb", "#93c5fd"],
  },
  dark: {
    file: "growing-snake-dark.svg",
    levels: ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"],
    head: "#bfdbfe",
    body: ["#60a5fa", "#1e40af"],
  },
};

async function loadCalendar() {
  const html = localHtml
    ? await readFile(localHtml, "utf8")
    : await (await fetch(`https://github.com/users/${user}/contributions`, {
        headers: { "X-Requested-With": "XMLHttpRequest", "User-Agent": "growing-snake" },
      })).text();
  const cells = [];
  for (const m of html.matchAll(/<td[^>]*class="ContributionCalendar-day"[^>]*>/g)) {
    const tag = m[0];
    const id = /id="contribution-day-component-(\d+)-(\d+)"/.exec(tag);
    const level = /data-level="(\d)"/.exec(tag);
    if (id && level) cells.push({ row: +id[1], col: +id[2], level: +level[1] });
  }
  if (cells.length < 7) throw new Error("could not parse contribution calendar");
  return cells;
}

const lerpColor = (a, b, t) => {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [ca, cb] = [p(a), p(b)];
  return "#" + ca.map((v, i) => Math.round(v + (cb[i] - v) * t).toString(16).padStart(2, "0")).join("");
};
const r4 = (n) => +n.toFixed(4);

function build(cells, theme) {
  const cols = Math.max(...cells.map((c) => c.col)) + 1;
  const width = PAD * 2 + cols * CELL - (CELL - SIZE);
  const height = PAD * 2 + 7 * CELL - (CELL - SIZE);
  const center = (col, row) => [PAD + col * CELL + SIZE / 2, PAD + row * CELL + SIZE / 2];

  // Enter from the left, then repeatedly chase the nearest uneaten day
  // (ties go to the leftmost), one grid step at a time.
  const path = [];
  for (let i = START_LEN + 1; i > 0; i--) path.push([-i, 3]);
  const eatStep = new Map(); // "col,row" -> path index of first visit
  const remaining = new Set(cells.filter((c) => c.level > 0).map((c) => `${c.col},${c.row}`));
  const visit = (c, r) => {
    path.push([c, r]);
    const key = `${c},${r}`;
    if (!eatStep.has(key)) eatStep.set(key, path.length - 1);
    remaining.delete(key);
  };
  let [hc, hr] = [-1, 3];
  while (remaining.size) {
    let best = null;
    const left = Math.min(...[...remaining].map((k) => +k.split(",")[0]));
    for (const key of remaining) {
      const [c, r] = key.split(",").map(Number);
      if (c > left + 1) continue; // never leave days behind

      const dist = Math.abs(c - hc) + Math.abs(r - hr);
      if (!best || dist < best.dist || (dist === best.dist && c < best.c)) best = { c, r, dist };
    }
    while (hc !== best.c || hr !== best.r) {
      if (hr !== best.r) hr += Math.sign(best.r - hr);
      else hc += Math.sign(best.c - hc);
      visit(hc, hr);
    }
  }

  // Grow as food is eaten, in path order.
  const food = cells.filter((c) => c.level > 0).map((c) => eatStep.get(`${c.col},${c.row}`)).sort((a, b) => a - b);
  const growAt = []; // path index at which segment START_LEN + n appears
  food.forEach((idx, n) => { if ((n + 1) % GROW_EVERY === 0) growAt.push(idx); });
  const maxLen = START_LEN + growAt.length;

  // Exit to the right far enough for the whole snake to leave the board.
  const [lastCol, lastRow] = path[path.length - 1];
  for (let i = 1; i <= maxLen + 2; i++) path.push([lastCol + i, lastRow]);

  const N = path.length - 1;
  const T = r4(N * STEP);
  const d = "M" + path.map(([c, r]) => center(c, r).join(" ")).join("L");

  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`);
  out.push(`<title>${user}'s contribution snake: it grows with every commit it eats</title>`);
  out.push(`<defs><path id="p" d="${d}"/></defs>`);

  for (const c of cells) {
    const [x, y] = [PAD + c.col * CELL, PAD + c.row * CELL];
    const fill = theme.levels[c.level];
    if (c.level === 0) {
      out.push(`<rect x="${x}" y="${y}" width="${SIZE}" height="${SIZE}" rx="2" fill="${fill}"/>`);
    } else {
      const t = r4(eatStep.get(`${c.col},${c.row}`) / N);
      out.push(
        `<rect x="${x}" y="${y}" width="${SIZE}" height="${SIZE}" rx="2" fill="${fill}">` +
          `<animate attributeName="fill" values="${fill};${theme.levels[0]}" keyTimes="0;${t}" calcMode="discrete" dur="${T}s" repeatCount="indefinite"/></rect>`,
      );
    }
  }

  // Draw tail first so the head stays on top.
  for (let k = maxLen - 1; k >= 0; k--) {
    const isHead = k === 0;
    const color = isHead ? theme.head : lerpColor(theme.body[0], theme.body[1], Math.min(1, k / Math.max(1, maxLen - 1)));
    const s = isHead ? SIZE + 1 : SIZE - (k < 3 ? 0 : 1);
    const lag = r4(k / N);
    const motion =
      `<animateMotion dur="${T}s" repeatCount="indefinite" calcMode="linear" keyPoints="0;0;${r4((N - k) / N)}" keyTimes="0;${lag};1"><mpath href="#p"/></animateMotion>`;
    let vis = "";
    if (k >= START_LEN) {
      const t = r4(growAt[k - START_LEN] / N);
      vis = `<animate attributeName="opacity" values="0;1" keyTimes="0;${t}" calcMode="discrete" dur="${T}s" repeatCount="indefinite"/>`;
    }
    out.push(
      `<rect x="${-s / 2}" y="${-s / 2}" width="${s}" height="${s}" rx="${isHead ? 4 : 3}" fill="${color}"${k >= START_LEN ? ' opacity="0"' : ""}>${motion}${vis}</rect>`,
    );
  }
  out.push("</svg>");
  return { svg: out.join("\n"), maxLen, eaten: food.length, seconds: T };
}

const cells = await loadCalendar();
await mkdir(outDir, { recursive: true });
for (const theme of Object.values(THEMES)) {
  const { svg, maxLen, eaten, seconds } = build(cells, theme);
  await writeFile(join(outDir, theme.file), svg);
  console.log(`${theme.file}: ate ${eaten} days, grew to ${maxLen} segments, loop ${seconds}s, ${svg.length} bytes`);
}
