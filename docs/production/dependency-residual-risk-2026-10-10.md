# Dependency Residual Risk Register — 2026-10-10 (Sprint 137)

Status of every advisory reported by `npm audit` at HEAD `d806cacc` (+ this sprint's docs),
together with the evidence behind each disposition and the owner of the remaining risk.

**Method (three independent checks + advisory text review — never one marker scan alone):**

1. **Shipped package inventory** — the set of packages inside `.next/standalone/node_modules`
   (what the Docker image actually copies): **42 packages**.
2. **Next.js file-trace manifest** (`.next/**/*.nft.json`, authoritative for "what was included"):
   **47 packages**.
3. **Control-validated bundle scan** over `.next/server/**/*.js`: the detector was validated with
   known-present controls (`mammoth` = 1 file, `next-auth` = 60 files, `@prisma/client` = 4 files),
   then the advisory packages returned **0** hits.
4. **Advisory text review** (GitHub Advisory / CVE) for the affected functions and the attacker
   prerequisites — recorded below.

**Explicit non-claims:** absence from a bundle is *supporting evidence*, not universal proof of
non-exploitability; inlined transitive code cannot be proven absent by marker search alone; and a
clean `npm audit` execution is not remediation.

## Register

| Package (installed) | Advisory | Severity | Shipped? / reachable? | Disposition | Follow-up |
|---|---|---|---|---|---|
| `braces` 3.0.3 | CVE-2026-93687 / GHSA-vfj7-8cjw-p6xm | High | Not in prod tree, artifact or bundles — lint only | `BUILD_OR_TEST_SCOPE_WITH_EVIDENCE` | `UPSTREAM_FIX_PENDING` (vendor: **no patch**) |
| `micromatch` 4.0.8 | via braces | High | lint only | `BUILD_OR_TEST_SCOPE_WITH_EVIDENCE` | `UPSTREAM_FIX_PENDING` |
| `fast-glob` 3.3.1 | via micromatch | High | lint only | `BUILD_OR_TEST_SCOPE_WITH_EVIDENCE` | `UPSTREAM_FIX_PENDING` |
| `@next/eslint-plugin-next` 16.4.0 | via fast-glob | High | lint only | `BUILD_OR_TEST_SCOPE_WITH_EVIDENCE` | `UPSTREAM_FIX_PENDING` |
| `eslint-config-next` 16.4.0 | via plugin | High | lint only (devDependency) | `BUILD_OR_TEST_SCOPE_WITH_EVIDENCE` | `UPSTREAM_FIX_PENDING` |
| `prisma` 7.10.0 | via `@prisma/config`, `mysql2` | High | In prod **tree**, absent from artifact & bundles | `NOT_PRESENT_IN_SHIPPED_ARTIFACT` | `RISK_ACCEPTANCE_REQUIRED` (exact-pinned) |
| `@prisma/config` 7.10.0 | via `deepmerge-ts` | High | tree only; runs only in Cloud Build `Migrate` / local CLI | `NOT_PRESENT_IN_SHIPPED_ARTIFACT` | `RISK_ACCEPTANCE_REQUIRED` |
| `deepmerge-ts` 7.1.5 | CVE-2026-40345 / GHSA-ggr8-5vv4-36mx | High | tree only; merges **repo-controlled** config files | `NOT_PRESENT_IN_SHIPPED_ARTIFACT` | `UPSTREAM_FIX_PENDING` (fix = major 8.0.0) |
| `mysql2` 3.15.3 | GHSA-3f6p-5ww8-9rcr | High | tree only; **no MySQL endpoint exists** in this deployment | `NOT_PRESENT_IN_SHIPPED_ARTIFACT` | `RISK_ACCEPTANCE_REQUIRED` |
| `mysql2` 3.15.3 | GHSA-rgwj-5xj2-c3m3 | Moderate | as above (`compress: true` never used) | `NOT_PRESENT_IN_SHIPPED_ARTIFACT` | `RISK_ACCEPTANCE_REQUIRED` |
| `argparse` 1.0.10 | via `sprintf-js` | Moderate | only referenced by mammoth's **CLI** entry | `NOT_PRESENT_IN_SHIPPED_ARTIFACT` | `UPSTREAM_FIX_PENDING` |
| `sprintf-js` 1.0.3 | CVE-2026-97058 / GHSA-hp3w-g68c-fv3c | Moderate | not in artifact/bundles | `NOT_PRESENT_IN_SHIPPED_ARTIFACT` | `UPSTREAM_FIX_PENDING` (vendor: **no patch**) |
| `mammoth` 1.13.0 | via `argparse` | Moderate | **library IS shipped** (docx import route) | `RUNTIME_EXPOSURE_UNCERTAIN` | see deep-dive below |

## Mammoth deep-dive (why it stays uncertain)

- Advisories in this chain concern **`sprintf-js` `sprintf()`**: attacker-controlled **format
  strings** (unbounded precision → `RangeError`), reached through **argparse**'s help/formatting.
- Inside `node_modules/mammoth`, `argparse` is referenced by **exactly one file**: `bin/mammoth`
  (the CLI executable, no `.js` extension). No file under `mammoth/lib/**` requires it, and
  `lib/index.js` (the library entry the application imports) pulls only library modules.
- The shipped bundle that contains mammoth contains **0** occurrences of `argparse`, `sprintf`,
  `vsprintf`, `ArgumentParser` or the CLI entry.
- The application calls the **library API** for docx import; it never spawns mammoth's CLI, and the
  platform never passes attacker-controlled format strings to `sprintf`.
- **Still uncertain, not resolved:** mammoth's library *is* on a runtime path, and I cannot prove the
  negative for every possible input or for inlined transitive code. Per policy this remains
  `RUNTIME_EXPOSURE_UNCERTAIN` rather than being downgraded to "harmless".

## Remediation attempts (what was *not* done, and why)

`prisma@7.10.0` **exact-pins** `mysql2` to `3.15.3` and `@prisma/config` **exact-pins**
`deepmerge-ts` to `7.1.5`. `npm audit`'s only offered "fix" is downgrading `prisma` to `6.x`
(a protected dependency — forbidden). Forcing an override would deviate from the vendor's exact
pins in order to remove code paths that require a **MySQL endpoint this deployment does not have**.
Therefore **no dependency change was applied**, and no major-version downgrade was used to lower the
audit count. `braces` and `sprintf-js` have **no patched version at all** (upstream).

## Risk acceptance requested

The register cannot be closed by this repository alone. The release owner must explicitly accept the
residual risk for the exact-pinned Prisma chain and for the mammoth chain (items marked
`RISK_ACCEPTANCE_REQUIRED` / `RUNTIME_EXPOSURE_UNCERTAIN`), or schedule an upstream-driven upgrade
window (`prisma` release with newer pins, or a mammoth release that drops argparse).

## Audit-side note (production reachability from the audit host)

During Sprint 137 the production Neon endpoint was **not reachable from the audit workstation**:
TCP 5432/443 connect, but both `pg` and the Prisma engine are reset at the protocol/TLS stage
(`read ECONNRESET`; `migrate status` → `P1001`). This is an **audit-host limitation, not evidence
that production is affected** (the service connects from inside GCP). Consequence: the Sprint 136
read-only preflight measurements (24 applied / 1 rolled_back / 0 unfinished / 0 pending / zero drift)
stand as of that timestamp and were **not re-attested** in Sprint 137, and
`LIVE_PRODUCTION_DATABASE_IDENTITY` remains **UNVERIFIED**.

## Audit incident log

- **2026-10-10 (Sprint 137):** a shell pattern intended to list configuration *key names* matched
  whole lines of the gitignored `cloud-run-env.yaml`, so a production connection string (including
  the password) was printed into the local session transcript. Verified impact: the file is
  **gitignored and untracked**, and **no tracked file** contains the credential (scanned for the
  provider's credential prefix across all tracked files: 0 hits) — nothing was pushed, and no remote
  system received it. **Recommended action (operator):** treat the credential as local-exposure only
  and rotate the Neon role password at the next convenient window as a precaution, since local chat
  transcripts are retained outside the repository's protection.
