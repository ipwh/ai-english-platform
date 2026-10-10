# Credential Incident — 2026-10-10 (Sprint 137 exposure, Sprint 138 containment)

**Status: OPEN — `PENDING EXTERNAL OPERATOR ACTION`.** No rotation has been performed: this
environment has neither Neon console access nor Cloud Run/Secret Manager write permissions, and no
explicit authorization to mutate cloud resources was supplied.

## 1. What happened

During the Sprint 137 audit, a shell command intended to list configuration **key names** matched
whole lines of the gitignored local file `cloud-run-env.yaml`, so one **production database
connection string (including its role password)** was printed into the assistant session output.

## 2. Verified exposure scope (measured, not assumed)

| Surface | Result |
|---|---|
| Tracked repository files | **NONE** (`git grep` for the provider's credential prefix: 0 hits; full tracked-file scan: 0 hits) |
| Local config files containing it | `.env.local` (2 occurrences), `.env` (1), `cloud-run-env.yaml` (2) — all gitignored by design |
| Other repository files (excluding `node_modules`/`.next`/`materials`) | none |
| Local session transcripts on disk | **2 files** (path identifiers only): `%APPDATA%\Code\User\workspaceStorage\abef9d005003979cbc86c39576a7ff81\GitHub.copilot-chat\transcripts\3672d3f6-….jsonl` and `…\transcripts\cd331cb5-….jsonl` |
| Editor global storage | 0 hits |
| Pushed to the repository / sent to any GCP resource | **No** — nothing was pushed, and no cloud resource was created or modified |

**Correction to the Sprint 137 report:** that report said "no remote system received it". That was
inaccurate. The command's output became part of the session context transmitted to the **GitHub
Copilot service** (the assistant has to receive tool output to reason about it). The value was
therefore disclosed to an authorized third-party service and retained under that service's policy.
Conclusion: **rotation is required, not merely precautionary.**

## 3. Consumers of the affected credential (verified from code)

1. **Cloud Build `Migrate` step** — reads Secret Manager `DIRECT_DATABASE_URL`, **version `latest`**
   (`cloudbuild.yaml:28,73`). Because it tracks `latest`, adding a new secret version is sufficient;
   no pipeline edit is needed.
2. **Cloud Run runtime** — the service carries plain environment variables (`DATABASE_URL`, and the
   direct variant), maintained with `--update-env-vars` (merge semantics).
3. **Local developer/operator machine** — `.env.local`, `.env`, `cloud-run-env.yaml`, consumed as
   fallbacks by `scripts/lib/db-env.ts` and ~8 scripts (`backfill-null-overall-accuracy`,
   `set-academic-year`, `link-teachers-to-classes`, `unassign-non-roster`,
   `audit-persisted-grammar-questions`, `remediate-20260927-defective-question`, …).
4. **Unknown (cannot be enumerated without Neon console access):** any non-repository consumer of
   the same Neon role (reporting/BI tools, other deployments). The operator must check this.

## 4. Rotation runbook (zero-downtime preferred)

> **Rules:** never pass a secret as a command-line argument; never commit it; never paste it into a
> prompt, report, or log. Prefer `--env-vars-file`/stdin/`--update-secrets` over inline values.

**Deployment timing and connection pools.** Cloud Run shifts traffic gradually and drains old
instances rather than killing them instantly, so **the old and new credentials must both be valid
during the cutover window** — which is precisely why step 2 prefers creating a new role over
resetting the existing one. A password reset invalidates the old credential immediately while
running instances still hold pooled connections to Neon through the pooler; in-flight and new
requests on those instances then fail until they are replaced. With a separate new role, the old
revision keeps working while the new revision is verified, and the old role is retired afterwards.
Also account for Neon's compute suspend/resume behaviour and connection limits: perform the cutover
in a low-traffic window and keep the verification steps read-only so they add no load.

**Prerequisites:** Neon console access (role administration), and `roles/secretmanager.admin` +
`roles/run.developer` (or equivalent) on the production project. An authorized operator performs this.

1. **Record the current state (safe identifiers only)**
   `gcloud run services describe english-platform --region=asia-east2 --format="value(status.latestReadyRevisionName,status.traffic)"`
   and note the current Secret Manager version number.
2. **Create a NEW Neon role** with the same privileges on the same database (do **not** reset the
   existing role yet) — this is what makes the cutover zero-downtime. If a new role is not possible,
   resetting the existing role's password is the fallback, and it invalidates the old password
   instantly, so steps 3–5 must be executed back-to-back with an accepted brief window.
3. **Add a new Secret Manager version** (password supplied via stdin, never argv):
   `gcloud secrets versions add DIRECT_DATABASE_URL --data-file=-`
   Cloud Build will use it immediately, so only do this after the new password is live in Neon.
4. **Point the runtime at the new credential without argv exposure.** Preferred: convert to a secret
   reference so future rotations need no env edit —
   `gcloud run services update english-platform --region=asia-east2 --update-secrets DATABASE_URL=DIRECT_DATABASE_URL:latest`
   (repeat for the direct variant if present). Otherwise update env vars from a file:
   `--env-vars-file` — **never** `--update-env-vars "DATABASE_URL=…"`.
5. **Verify without displaying anything**
   - Read-only schema check with the new credential: `npx prisma migrate status`
     → expect `Database schema is up to date!`, exit 0.
   - Application health: `GET /api/health` → healthy.
   - Negative test: attempt a connection with the **old** credential (kept in a temporary local file)
     and confirm it is **rejected** (authentication error).
6. **Update the local files** (`.env.local`, `.env`, `cloud-run-env.yaml`) with the new value and
   confirm they remain ignored: `git check-ignore -v .env.local cloud-run-env.yaml`.
7. **Retire the old role/credential** only after step 5 passes everywhere.
8. **Rollback:** if verification fails, disable the new secret version, revert the service to the
   previous revision, and keep the old role active. **Never revoke the old credential before the new
   one is confirmed working in every consumer.**
9. **Evidence to record:** timestamps, revision names, secret version numbers, health responses and
   exit codes — **no secret values**.

## 5. Transcript retention (operator decision required)

Two local transcript files retain the value (paths in §2). **No deletion was performed and no
containment is claimed** — transcript retention is the operator's approved procedure, and deleting
audit records without authorization would itself be inappropriate. Recommended operator actions:
apply the approved retention procedure to those two files, and treat the value as disclosed per §2's
correction (rotation per §4 is the real containment).

## 6. Preventive follow-up (implemented in this sprint)

A repository guard (`src/shared/__tests__/secret-hygiene.test.ts`) now scans every git-tracked file
for production-shaped database credentials (Neon endpoint URLs carrying an inline password, and the
provider's credential prefix), with a control assertion proving the detector actually fires. It
cannot catch leaks into untracked local files or transcripts — that remains a process control, which
is why §4's rule "never pass a secret as an argument" matters.

Longer term, the same hardening that makes rotation cheap also removes this failure mode: storing
the runtime credential as a **Secret Manager reference** instead of a plain environment variable
(§4 step 4) means a future exposure of configuration output cannot reveal a usable password.
