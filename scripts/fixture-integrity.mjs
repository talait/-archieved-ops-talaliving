/** Do the seed's keys point at anything, and is each one only one thing?
 *
 *  Two bugs of this exact shape have been found by accident, each after sitting
 *  in the fixtures for six milestones:
 *
 *  - **F84** — two seeded progress rows sharing a primary key, invisible because
 *    nothing had ever dereferenced one.
 *  - **F86** — nine stock issues and a return pointing at two work orders that
 *    have never existed, invisible because nothing had ever joined a stock move
 *    to a work order.
 *
 *  Both were found by reading, which is not a method. This is the method
 *  (F98). It checks the seed files themselves — not the running state — which is
 *  where both bugs lived and where they are cheapest to see.
 *
 *  Run: `npm run check:fixtures`. It needs nothing running.
 *
 *  ## What counts as defining an id, and the blind spot that is admitted
 *
 *  Most rows spell it `id: "att_40"`. Some do not: `pr.ts` seeds its lines as
 *  tuples — `["doc_06", "prl_0601", 1, …]` — where the id is a bare string in an
 *  array. A check that only understood `id:` reported thirteen perfectly good PR
 *  lines as dangling on its first run, and **a check that flags thirteen correct
 *  things is one nobody reads** (F92).
 *
 *  So an id-shaped string is a *reference* when it appears as `field: "value"`
 *  with the field not being `id`, and a *definition* in every other position.
 *  That is deliberately generous: `"doc_06"` sitting at position 0 of a PR-line
 *  tuple is really a reference, and this counts it as a definition.
 *
 *  The cost of that is stated rather than hidden: **a dangling reference whose
 *  value also appears bare inside some tuple will not be caught.** The check
 *  errs toward silence, which is the wrong direction in general and the right
 *  one here — the alternative was thirteen false alarms on every run, and a
 *  noisy check protects nothing because nobody runs it twice.
 *
 *  The prefixes are not a list anybody maintains. They are read off the ids the
 *  seed actually defines, so a new kind of record is covered the day it is
 *  added, without anybody remembering to say so.
 */
import fs from "node:fs";
import path from "node:path";

const DIR = "src/demo/fixtures";
const ID_SHAPE = /^([a-z]{2,8})_[A-Za-z0-9_]+$/;

/* Document numbers — the *other* referencing scheme, and the one F86 was
   actually about. `spk-26-08-17_01` does not match ID_SHAPE, so the first
   version of this check would not have caught the bug it was written to
   prevent. A base number and a suffixed one are different kinds of thing
   (`po-…_01` is an order, `po-…_01-M01` a schedule term), so they are counted
   apart or their declaring fields tie. */
const DOC_BASE = /^([a-z]{2,5})-2\d-\d{2}-\d{2}_\d+$/;
const DOC_SUFFIXED = /^([a-z]{2,5})-2\d-\d{2}-\d{2}_\d+-([A-Z])\d+$/;

/** Kinds built at runtime rather than seeded, so the seed files cannot show
 *  them and a text scan must not call them missing.
 *
 *  `pr/L` is `line_no_full`, composed in `pr.ts` as
 *  `${DOC_NO[doc_id]}-L${line_no}` — six perfectly real PR lines that the first
 *  run reported as dangling. This is the scanner's honest limit: it reads text,
 *  so a value no line contains is a value it cannot see. Anything listed here
 *  is unchecked, which is why the list is short and each entry says why. */
const COMPUTED_KINDS = new Set(["pr/L"]);

/** Known gaps in the seed, declared so they cannot be forgotten and so a *new*
 *  one still fails. Same ratchet as `KNOWN_GAP` in the conformance check.
 *
 *  These five tanda terima are quoted by twelve rack movements and declared
 *  nowhere. They are **not** repointed at the fourteen receipts that do exist,
 *  because those cover different items entirely — ITM-0001, ITM-0006 — and
 *  picking a near date would replace a reference to nothing with a reference to
 *  the wrong thing, which is worse and much harder to notice later.
 *
 *  Whether those goods should have a tanda terima behind them at all is the
 *  owner's question, not this check's, and it is raised as backlog S4. Until it
 *  is answered the app says so on the stock drawer — *tanda terima ini tidak
 *  ada* — which is the honest state: a figure may be missing, never quietly
 *  wrong. */
const UNRESOLVED = new Set([
  "rcv-26-08-24_01", "rcv-26-08-26_02", "rcv-26-08-28_01",
  "rcv-26-08-29_01", "rcv-26-08-31_01",
]);

function docKind(value) {
  const base = DOC_BASE.exec(value);
  if (base) return base[1];
  const suf = DOC_SUFFIXED.exec(value);
  return suf ? `${suf[1]}/${suf[2]}` : null;
}

/* Three bags, because the two questions need different evidence.
 *
 *  A duplicate key is only meaningful for a row that *declares* one — `id: "X"`.
 *  Counting bare tuple strings as declarations made `lgp_03` look like ten
 *  records with the same id when it is one record referenced nine times.
 *
 *  A dangling reference is the opposite: anything that could possibly be a
 *  definition should count, or every tuple-seeded PR line reads as missing.
 */
const declared = new Map();    // `id: "X"` only  -> ["file:line", …]
const anyDefinition = new Set(); // declared, plus bare strings in tuples
const referenced = new Map();  // `field: "X"`    -> ["file:line (field)", …]
const perKind = new Map();     // doc-number kind -> field -> rows

for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith(".ts"))) {
  const lines = fs.readFileSync(path.join(DIR, file), "utf8").split("\n");
  lines.forEach((line, n) => {
    const where = `${file}:${n + 1}`;
    /* Every string literal on the line, with whatever key introduced it. */
    for (const m of line.matchAll(/(?:\b([A-Za-z_][A-Za-z0-9_]*)\s*:\s*)?"([^"\\]+)"/g)) {
      const [, field, value] = m;
      const kind = docKind(value);
      if (kind) {
        if (!perKind.has(kind)) perKind.set(kind, new Map());
        const byField = perKind.get(kind);
        const key = field ?? "(bare)";
        if (!byField.has(key)) byField.set(key, []);
        byField.get(key).push({ value, where, field: key });
        continue;
      }
      if (!ID_SHAPE.test(value)) continue;
      if (field !== undefined && field !== "id") {
        if (!referenced.has(value)) referenced.set(value, []);
        referenced.get(value).push(`${where} (${field})`);
        continue;
      }
      anyDefinition.add(value);
      if (field === "id") {
        if (!declared.has(value)) declared.set(value, []);
        declared.get(value).push(where);
      }
    }
  });
}

/* Read off the seed, never maintained by hand. */
const prefixes = new Set([...anyDefinition].map((k) => k.match(ID_SHAPE)[1]));

/** Document numbers, checked by a different rule than ids.
 *
 *  There is no `id:` convention to lean on — `wo_no` holds `spk-…`, `box_no`
 *  holds `kol-…`, `move_no` holds `ppn-…`, so the field name says nothing about
 *  the prefix and no map could be derived from it. What the data does say is
 *  which field carries the *most distinct values* of a kind: seven `spk-`
 *  numbers live in `wo_no` and two in `ref_no`, and the seven are the work
 *  orders. So the fattest field declares, every other mention refers, and the
 *  rule needs nothing maintained by hand.
 */
function documentProblems(perKind) {
  const out = [];
  for (const [kind, byField] of perKind) {
    if (COMPUTED_KINDS.has(kind)) continue;
    const fields = [...byField].sort((a, b) => distinct(b[1]) - distinct(a[1]));
    const [declaringField, declaringRows] = fields[0];
    const declared = new Set(declaringRows.map((r) => r.value));
    const seen = new Set();
    for (const [, rows] of fields.slice(1)) {
      for (const r of rows) {
        if (declared.has(r.value) || seen.has(r.value) || UNRESOLVED.has(r.value)) continue;
        seen.add(r.value);
        out.push(`${r.value}  <- ${r.where} (${r.field})   declared by \`${declaringField}\``);
      }
    }
  }
  return out;
}
const distinct = (rows) => new Set(rows.map((r) => r.value)).size;

const duplicates = [...declared.entries()].filter(([, at]) => at.length > 1);
const dangling = [...referenced.entries()]
  .filter(([v]) => prefixes.has(v.match(ID_SHAPE)[1]) && !anyDefinition.has(v));

console.log(`${declared.size} ids declared across ${prefixes.size} kinds of record; `
  + `${referenced.size} referenced.`);

if (duplicates.length) {
  console.error(`\nFAIL: ${duplicates.length} id(s) defined more than once. `
    + "Lookup is `.find()`, so the first one wins and the rest are unreachable:");
  for (const [id, at] of duplicates) console.error(`  ${id}  at ${at.join(", ")}`);
}
if (dangling.length) {
  console.error(`\nFAIL: ${dangling.length} id(s) referenced but never defined:`);
  for (const [id, at] of dangling) {
    console.error(`  ${id}  <- ${at.slice(0, 4).join(", ")}${at.length > 4 ? ` +${at.length - 4}` : ""}`);
  }
}

/* A seed with no ids means the scan found nothing to scan — not a clean seed
   (F96, F97). The floor is low on purpose; it is there to catch a moved
   directory or a changed quoting style, not to assert a size. */
if (declared.size < 100) {
  console.error(`\nFAIL: only ${declared.size} ids found in ${DIR}. `
    + "The check did not read the fixtures, which is not the same as them being empty.");
  process.exit(1);
}
const docDangling = documentProblems(perKind);
if (docDangling.length) {
  console.error(`\nFAIL: ${docDangling.length} document number(s) referenced but never declared:`);
  for (const x of docDangling) console.error(`  ${x}`);
}

console.log(`${perKind.size} kinds of document number checked.`);

if (duplicates.length || dangling.length || docDangling.length) process.exit(1);
console.log("\nOK: every key is unique, and every reference points at something.");
