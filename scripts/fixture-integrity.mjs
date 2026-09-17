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

for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith(".ts"))) {
  const lines = fs.readFileSync(path.join(DIR, file), "utf8").split("\n");
  lines.forEach((line, n) => {
    const where = `${file}:${n + 1}`;
    /* Every string literal on the line, with whatever key introduced it. */
    for (const m of line.matchAll(/(?:\b([A-Za-z_][A-Za-z0-9_]*)\s*:\s*)?"([^"\\]+)"/g)) {
      const [, field, value] = m;
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
if (duplicates.length || dangling.length) process.exit(1);
console.log("\nOK: every key is unique, and every reference points at something.");
