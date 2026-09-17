/** Can everybody open the doors their own menu shows them?
 *
 *  Two sweeps, one browser.
 *
 *  **Every route**, signed in as whoever the picker offers first, including the
 *  six dynamic ones that no menu links to. Catches a page that throws, 404s, or
 *  renders nothing.
 *
 *  **Every user's own menu**, which is the half that needed writing. The sidebar
 *  filters itself with `can(permission)`, so each of the eight seeded accounts
 *  sees a different app — between 11 and 50 links. A menu item that leads
 *  somewhere its owner cannot open is F61 again: *nobody in the seed could open
 *  these screens at all*, invisible for as long as nobody checked as anybody but
 *  themselves. A single-user sweep cannot see it, and this project has only ever
 *  had single-user sweeps.
 *
 *  Run: `npm run check:routes` (needs the app running — PROBE_URL, as the
 *  refusal probe).
 *
 *  ## Why it counts what it counts
 *
 *  The first two versions of this reported **0 problems while measuring nothing**
 *  (F97). The first read user names from the avatar and got single letters; the
 *  second found one nav link per user, because the sidebar's sections are
 *  collapsible and links are not rendered while a section is closed. Both printed
 *  a clean sheet. Both were wrong, and neither was wrong in a way that looked
 *  like an error — they looked like good news.
 *
 *  So the floors below are part of the check, not decoration. A sweep that finds
 *  no users, or a user with no menu, has failed to measure rather than found
 *  nothing to report. F96's guard, one level up: **an empty list of failures and
 *  a failure to look are the same output.**
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.PROBE_URL ?? "http://localhost:3100";
const NAV_TIMEOUT = Number(process.env.SWEEP_TIMEOUT ?? 30_000);

/* Values that exist in the fixtures. A dynamic route is only exercised if the
   parameter resolves to something real; a made-up id tests the not-found path
   and calls it a pass. */
const PARAMS = {
  "[box]": "kol-26-09-02_01",
  "[run]": "pyr-26-09-06_01",
  "[po]": "po-26-08-14_01",
  "[vendor]": "vnd_01",
};

/** Routes that are *meant* to land somewhere else.
 *
 *  Declared, with the reason, because the alternative is a check that flags two
 *  correct behaviours on every run — and a warning that fires on everything is a
 *  warning nobody reads (F92). Same ratchet as `KNOWN_GAP` in the conformance
 *  check: a **new** redirect fails until somebody says here why it exists.
 */
const INTENTIONAL_REDIRECTS = {
  "/": "/dashboard",
  /* D202: sawn boards merged into the timber module — one piece of wood either
     side of a saw. The route is kept rather than 404'd because it is in
     people's history. */
  "/inventory/papan": "/inventory/log",
};

/* Floors. Below these the sweep did not run, whatever it printed. */
const MIN_USERS = 2;
const MIN_LINKS_PER_USER = 3;

function routes() {
  const out = [];
  const walk = (dir, url) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const seg = e.name.startsWith("(") ? "" : `/${e.name}`;
      const next = `${url}${seg}`;
      if (fs.existsSync(path.join(dir, e.name, "page.tsx"))) out.push(next || "/");
      walk(path.join(dir, e.name), next);
    }
  };
  walk("src/app", "");
  if (fs.existsSync("src/app/page.tsx")) out.push("/");
  return [...new Set(out)].sort();
}

const fill = (r) => Object.entries(PARAMS).reduce((u, [k, v]) => u.replaceAll(k, v), r);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
const problems = [];

/** Open one URL and say what was wrong with it, or nothing. */
async function visit(href, expectPath = href) {
  const errs = [];
  const onErr = (e) => errs.push(`pageerror: ${e.message.slice(0, 120)}`);
  page.on("pageerror", onErr);
  let status = 0;
  let text = "";
  try {
    const r = await page.goto(BASE + href, { waitUntil: "networkidle", timeout: NAV_TIMEOUT });
    status = r ? r.status() : 0;
    await page.waitForTimeout(350);
    text = (await page.innerText("body")).trim();
  } catch (e) {
    errs.push(`nav: ${String(e.message).split("\n")[0]}`);
  }
  page.off("pageerror", onErr);
  const landed = new URL(page.url()).pathname;
  const meantTo = INTENTIONAL_REDIRECTS[expectPath];
  const misplaced = landed !== expectPath && landed !== meantTo;
  const bad = status !== 200 || errs.length || text.length < 40 || misplaced;
  if (!bad) return null;
  return `${href}  status=${status}`
    + (misplaced ? `  redirected -> ${landed}` : "")
    + (text.length < 40 ? "  BLANK" : "")
    + (errs.length ? `  ${errs.join("; ")}` : "");
}

async function accounts() {
  await page.goto(`${BASE}/signin`, { waitUntil: "networkidle", timeout: NAV_TIMEOUT });
  await page.waitForTimeout(300);
  return page.$$('button:has(.font-mono)');
}

try {
  /* ---- 1. every route, as the first account ---------------------------- */
  const picker = await accounts();
  if (picker.length) { await picker[0].click(); await page.waitForTimeout(1200); }

  const all = routes();
  /* `/demo` runs the refusal probes on mount and takes fifteen seconds; it has
     its own check and is skipped rather than paid for twice. */
  for (const r of all.filter((r) => r !== "/demo")) {
    const p = await visit(fill(r), fill(r));
    if (p) problems.push(`route  ${p}`);
  }
  console.log(`routes: ${all.length - 1} swept, ${problems.length} with a problem`);
  for (const x of problems) console.log(`    ${x}`);

  /* ---- 2. every account, every link its own menu offers ----------------- */
  const n = (await accounts()).length;
  if (n < MIN_USERS) {
    console.error(`\nFAIL: found ${n} account(s) on the sign-in picker. `
      + "The sweep could not see the accounts, which is not the same as there being none.");
    process.exit(1);
  }

  let linkTotal = 0;
  for (let i = 0; i < n; i++) {
    const rows = await accounts();
    const name = ((await rows[i].innerText()).split("\n").filter((s) => s.trim())[1] ?? "?").trim();
    await rows[i].click();
    await page.waitForURL((u) => !/\/signin/.test(u.toString()), { timeout: NAV_TIMEOUT }).catch(() => {});
    await page.waitForTimeout(1000);

    if (/\/no-access/.test(page.url())) {
      console.log(`${name.padEnd(20)} -> /no-access (no modules granted)`);
      continue;
    }

    /* Sections are collapsible and a closed one renders no links at all. Not
       expanding them is how the second version of this check came to believe
       every account had exactly one menu item. */
    for (const s of await page.$$("nav > div > button")) {
      await s.click().catch(() => {});
      await page.waitForTimeout(50);
    }
    await page.waitForTimeout(250);

    const links = await page.$$eval('nav a[href^="/"]',
      (as) => [...new Set(as.map((a) => a.getAttribute("href")))]);

    if (links.length < MIN_LINKS_PER_USER) {
      problems.push(`menu   ${name}: ${links.length} link(s) visible — the sidebar was not read`);
      console.log(`${name.padEnd(20)} links ${links.length}  <-- too few to be real`);
      continue;
    }
    linkTotal += links.length;

    const bad = [];
    for (const href of links) {
      const p = await visit(href);
      if (p) bad.push(p);
    }
    for (const x of bad) problems.push(`menu   ${name}: ${x}`);
    console.log(`${name.padEnd(20)} links ${String(links.length).padStart(2)}`
      + (bad.length ? `  <-- ${bad.length} PROBLEM` : ""));
    for (const x of bad) console.log(`    ${x}`);
  }

  console.log(`\n${n} accounts, ${linkTotal} account-and-route combinations checked.`);
  if (problems.length) {
    /* Named, every one of them. A check that reports a count and not the thing
       counted sends somebody back to reproduce it by hand, which is most of the
       work the check was supposed to save. */
    console.error(`\nFAIL: ${problems.length} problem(s):`);
    for (const x of problems) console.error(`  ${x}`);
    process.exit(1);
  }
  console.log("OK: every route renders, and every menu opens what it offers.");
} finally {
  await browser.close();
}
