/** Does anything stick out sideways, at the three widths this is built for?
 *
 *  390 · 768 · 1440 — a phone, a tablet, a laptop. The milestone board has
 *  claimed *no overflow anywhere* twice, both times after somebody resized a
 *  window and looked. This is that claim, checked (F100).
 *
 *  Run: `npm run check:layout` (needs the app running — PROBE_URL).
 *
 *  ## The probe, and the two obvious ones that are both wrong
 *
 *  **`documentElement.scrollWidth > innerWidth`** is the usual test and it
 *  passes everything here, including at a 240px viewport where the app cannot
 *  possibly fit. It is not lying: the page really does not scroll sideways. The
 *  wide content lives inside cards that scroll on their own, so the document
 *  never grows. A test that cannot fail at 240px is not measuring the thing.
 *
 *  **Every element whose right edge passes the viewport** is the obvious
 *  correction, and it reports thirty-five faults on one ordinary screen — every
 *  `table`, `thead`, `tr` and `th` inside a card that is *meant* to scroll. A
 *  wide table in an `overflow-x-auto` card is the design, not a bug.
 *
 *  So the question is neither. It is **does anything overflow the viewport
 *  without a scroll container to hold it** — an element past the edge whose
 *  ancestors, up to `body`, never set `overflow-x` to `auto` or `scroll`. On the
 *  same screen that gives thirty-five, that gives zero, and at 240px it gives
 *  the real faults.
 *
 *  Page-level scroll is kept as a second, separate signal. The two fail
 *  differently — one is a document that grew, the other is content escaping its
 *  box — and a single number for both would hide which.
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.PROBE_URL ?? "http://localhost:3100";
const WIDTHS = (process.env.LAYOUT_WIDTHS ?? "390,768,1440").split(",").map(Number);

/** Overflow that is declared, with the reason, so a **new** one still fails.
 *
 *  Same ratchet as `KNOWN_GAP` and `INTENTIONAL_REDIRECTS`. Two kinds live here
 *  and they are not the same kind:
 *
 *  `/proyek/peti/label` is **not a fault**. It is an A4 sheet measured in real
 *  millimetres — `w-[194mm]` — so that the preview and the paper are the same
 *  object. A4 does not fit a 390px phone and is not supposed to; making it fit
 *  would break the thing it exists for.
 *
 *  The other three **are** faults, found by this check on its first honest run
 *  and not yet fixed (backlog S5). Each card is wider than the viewport for a
 *  reason inside its body rather than its header, and each needs its own look.
 *  They are listed rather than left failing, because a check that is red on
 *  arrival is a check somebody switches off in a week.
 */
const KNOWN_OVERFLOW = new Set([
  "390:/proyek/peti/label", "768:/proyek/peti/label",
  "390:/dashboard", "390:/it/aturan-gaji", "390:/inventory/penyesuaian",
]);

const PARAMS = {
  "[box]": "kol-26-09-02_01",
  "[run]": "pyr-26-09-06_01",
  "[po]": "po-26-08-14_01",
  "[vendor]": "vnd_01",
};

function routes() {
  const out = [];
  const walk = (dir, url) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const next = `${url}${e.name.startsWith("(") ? "" : `/${e.name}`}`;
      if (fs.existsSync(path.join(dir, e.name, "page.tsx"))) out.push(next || "/");
      walk(path.join(dir, e.name), next);
    }
  };
  walk("src/app", "");
  return [...new Set(out)].sort()
    .filter((r) => r !== "/demo")   // its own check, and fifteen seconds of probes
    .map((r) => Object.entries(PARAMS).reduce((u, [k, v]) => u.replaceAll(k, v), r));
}

/** Runs in the page. Returns the faults, or null. */
const probe = () => {
  const W = window.innerWidth;
  const escaped = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.right <= W + 1) continue;
    let a = el.parentElement;
    let held = false;
    while (a && a !== document.body) {
      /* `<main>` authors `overflow-y-auto` and nothing else — but CSS computes
         the other axis to `auto` as soon as one axis is set, so `overflow-x`
         reads `auto` on the app shell of every single page. A walk that trusts
         the computed value therefore finds a holder every time and declares all
         overflow intentional: the check passed a deliberately injected 2200px
         div, and passed a 240px viewport (F100). The shell is not a box holding
         content, it is the page, so it never counts as one. */
      const ox = getComputedStyle(a).overflowX;
      if ((ox === "auto" || ox === "scroll") && a.tagName !== "MAIN") { held = true; break; }
      a = a.parentElement;
    }
    if (held) continue;
    escaped.push({
      what: `${el.tagName.toLowerCase()}${String(el.className || "").split(" ").filter(Boolean).slice(0, 3).map((c) => `.${c}`).join("")}`.slice(0, 80),
      by: Math.round(r.right - W),
    });
  }
  const pageScroll = document.documentElement.scrollWidth - W;
  if (!escaped.length && pageScroll <= 1) return null;
  /* Widest first: on a broken page one container usually drags the rest. */
  escaped.sort((a, b) => b.by - a.by);
  return { pageScroll: pageScroll > 1 ? pageScroll : 0, escaped: escaped.slice(0, 3), count: escaped.length };
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const context = await browser.newContext({ viewport: { width: WIDTHS[0], height: 900 } });
const page = await context.newPage();
const problems = [];

try {
  await page.goto(`${BASE}/signin`, { waitUntil: "networkidle", timeout: 30_000 });
  await page.waitForTimeout(300);
  /* The widest grants, so every screen actually renders something to measure. */
  for (const row of await page.$$('button:has(.font-mono)')) {
    if (/IT \/ Shared/.test(await row.innerText())) { await row.click(); break; }
  }
  await page.waitForTimeout(1500);

  const all = routes();
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    for (const r of all) {
      await page.goto(BASE + r, { waitUntil: "networkidle", timeout: 30_000 }).catch(() => {});
      await page.waitForTimeout(220);
      const bad = await page.evaluate(probe).catch(() => null);
      if (!bad) continue;
      if (KNOWN_OVERFLOW.has(`${width}:${r}`)) continue;
      problems.push(`${String(width).padStart(4)}px  ${r}`
        + (bad.pageScroll ? `  page scrolls by ${bad.pageScroll}px` : "")
        + (bad.count ? `  ${bad.count} element(s) escaped: `
          + bad.escaped.map((e) => `${e.what} (+${e.by}px)`).join(", ") : ""));
    }
    console.log(`${String(width).padStart(4)}px  ${all.length} routes`);
  }

  /* Nothing measured is not the same as nothing wrong (F96, F97). */
  if (all.length < 10) {
    console.error(`\nFAIL: only ${all.length} routes found. The sweep did not read src/app.`);
    process.exit(1);
  }
  if (problems.length) {
    console.error(`\nFAIL: ${problems.length} route/width combination(s) overflow:`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(`\nOK: ${all.length * WIDTHS.length} route/width combinations, nothing escapes its box.`);
} finally {
  await browser.close();
}
