# Moving to `it-tala/ops-talaliving`, and deploying on Cloudflare

**Written for a session that can reach `it-tala`.** This one cannot — see §1 —
so everything below is established fact plus the work that is left, not a
report of work done.

Read `docs/plan/deploy/README.md` first. It is the deployment brief and it still
holds; this file is the two things it does not cover: which repository, and
which host.

---

## 1. Why this had to be handed over

Three channels were tried, all closed:

| Channel | Result |
|---|---|
| `add_repo` for `it-tala/ops-talaliving` | refused — cross-owner adds unsupported; the session already holds `talait` |
| GitHub MCP (`list_branches`) | `Access denied: repository is not configured for this session` |
| `git ls-remote` through the session proxy | `could not read Username for 'https://github.com' ` |

So a session must be **started with `it-tala/ops-talaliving` as its initial
source**. Nothing else unblocks it.

## 2. What the owner may not know yet

`talait/ops-talaliving` has been **renamed to `talait/-archieved-ops-talaliving`**.
It is **public**, and GitHub reports it as a **fork**. GitHub redirects renamed
repositories, so this session's `origin` kept working and every push landed —
in the archived public fork.

**Everything built is safe there**, on `claude/serene-euler-eq2qef` at `9d6092b`.
Nothing is lost. But the newest work is in a *public* repository, which is the
thing the move is meant to end.

## 3. Exactly what has to travel

`it-tala/ops-talaliving` was pushed at **2026-09-18 01:47 UTC**, about fourteen
hours after this branch's last commit (2026-09-17 11:33 UTC). It may already
hold all of this or none of it — that cannot be seen from here, so **check
before copying anything**:

```bash
git ls-remote https://github.com/it-tala/ops-talaliving.git
# 9d6092b present anywhere → M61–M68 already arrived, and §3 is done.
```

If it is not there, the branch is what matters, **not `main`**. On the old
remote, `main` is at `e76ad8b` and is **eight commits behind**:

| | |
|---|---|
| `9d6092b` | M68 — layout sweep; six real 390px overflows, three fixed |
| `3fde590` | M67 — document-number integrity; three dangling references fixed |
| `9c5feaa` | M66 — fixture key integrity; four duplicate ids, three missing |
| `3f3e70e` | M65 — route + per-account menu sweep |
| `aa54e85` | M64 — refusal probe into the repo, and the first CI |
| `9492019` | M63 — demo affordances derived from one constant |
| `d2a88bb` | M62 — API seam conformance; the 43-value gap |
| `2c64601` | M61 — the deployment brief |

The whole history is worth carrying, not a squashed snapshot: `findings.md` is
the deliverable of Phase 1 as much as the app is, and the commit messages are
where the reasoning lives.

```bash
# in a session sourced from it-tala/ops-talaliving
git remote add old https://github.com/talait/-archieved-ops-talaliving.git
git fetch old claude/serene-euler-eq2qef
# then merge, or reset the default branch to it if the new repo is empty
```

Afterwards, **archive or delete the public fork** — that is the owner's call and
the reason the move exists. Do not leave two writable copies: the next session
that opens the old one will push into a repository nobody is reading.

## 4. Cloudflare needs a Next 15 upgrade first

This is the finding that changes the plan, and it was measured, not assumed.

Both Cloudflare adapters refuse to install against Next 14.2.35:

| Adapter | Peer requirement |
|---|---|
| `@opennextjs/cloudflare@1.20.6` (Workers) | `next >=15.5.24 <16 \|\| >=16.3.3` |
| `@cloudflare/next-on-pages@1.13.16` (Pages) | `next >=14.3.0 <=15.5.2` |

Note they do not overlap: one floors above where the other caps. **The adapter
has to be chosen before the version is**, not after.

**A static export is not the way out.** Six routes are dynamic — `/box/[box]`,
`/hrd/payroll/[run]`, `…/payslip`, `/procurement/po/[po]`, `…/print`,
`/procurement/tracker/[vendor]` — and in demo mode a person can *create* a box,
an order or a payroll run during their session. Their ids do not exist at build
time, so `generateStaticParams` cannot enumerate them and every such page would
404. The demo would break precisely where somebody has just done something.

### How big the upgrade actually is

Smaller than it sounds, and countable:

- **Six files.** All six dynamic routes are `"use client"` and read `params`
  synchronously. In Next 15 `params` is a Promise, so each needs
  `React.use(params)` — one line each.
- **Nothing else obvious.** No `route.ts` handlers anywhere, no `cookies()`,
  `headers()` or `draftMode()`, and **no `fetch()` calls at all**, so the change
  to caching defaults — usually the expensive part of this upgrade — cannot
  touch this app.
- The five outstanding npm advisories are already recorded as needing a Next
  major upgrade. **This is that upgrade**; the two jobs are one job.

Verify with the full suite afterwards, not just the build: `npm run check:api`,
`check:fixtures`, `check:refusals`, `check:routes`, `check:layout`.

### Recommendation

**Workers via `@opennextjs/cloudflare`, on the latest Next 15.** It is the path
Cloudflare actively develops, it does not require every dynamic route to be
moved to the Edge runtime the way `next-on-pages` does, and its floor
(≥15.5.24) points at a supported version rather than a capped one heading for
end of life.

### Preview and production

Cloudflare gives a deployment URL per branch, which is the preview environment —
no second project needed. What does need deciding, and belongs to the owner:

1. Which domain production answers on.
2. Whether previews are **public**. A preview URL of a private repository is
   still reachable by anyone holding the link, and this app is a convincing
   demo of a real company's operations. Cloudflare Access in front of previews
   is the cheap answer.
3. Production stays in **demo mode** until backlog S2 and S3 are done. `REAL` in
   `src/demo/api/index.ts` is a literal `false` for the reason given there, and
   flipping it while the seam is 43 values short breaks the app at the first
   click.

## 5. Order

1. Start a session sourced from `it-tala/ops-talaliving`.
2. `git ls-remote` it — if `9d6092b` is there, skip to 4.
3. Bring `claude/serene-euler-eq2qef` across with its history; make it the
   default branch's content.
4. Archive or delete `talait/-archieved-ops-talaliving`.
5. Choose the adapter, then upgrade Next accordingly. Six `React.use(params)`
   edits. Run all five checks.
6. Wire Cloudflare: build command, output directory, the branch previews, and
   Access in front of them if the answer to §4.2 is no.
7. Only then reopen the question of live data.
