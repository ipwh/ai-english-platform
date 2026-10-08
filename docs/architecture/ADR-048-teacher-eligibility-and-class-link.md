# ADR-048: Teacher Eligibility by School Domain & Class Auto-Link

- **Status**: Accepted
- **Date**: 2026-10-08
- **Related**: ADR-043 (delivery integrity, roster authorization), ADR-044 (measurable practice & teacher signals)
- **Supersedes**: nothing (extends ADR-043 §4 — teacher population & authorization)

## Context

Two coupled defects were found in production:

1. **`TeacherClass` was empty for every teacher.** Teacher accounts are auto-created on the first Google sign-in; that path wrote only the `User` row. Because roster, class-list, student-detail and per-question-answer access are all authorized through `TeacherClass`, every non-admin teacher saw an empty student list (`GET /api/teacher/students` returned `{students: [], classes: []}`), an empty class filter (`GET /api/classes`), and `403` on student detail / practice history. Only the single `admin` account bypassed these checks.
2. **A non-school-domain Google account held the teacher role.** The sign-in rule was "email prefix is not `s\d{7}` ⇒ teacher", so any Google account (e.g. a student's personal Gmail that also appears in the roster sheet, or an outside account) became a teacher — with teacher-level powers such as exporting every student's data (`/api/admin/export/students` deliberately allows teachers) and, after the class auto-link, every class roster.

The rule was also duplicated in four places (`auth-next.ts` twice, `app/page.tsx`, `role-select/page.tsx`), so a role decision made in one place was silently reverted by another: demoting an account did not persist, because the next sign-in/home-page load auto-promoted it back to teacher.

## Decision

1. **Only school-domain accounts can be teachers or admins.** `src/shared/auth/sign-in-role.ts` is the single owner of the rule (`SCHOOL_EMAIL_DOMAINS`, `ADMIN_EMAILS`, `isSchoolDomainEmail()`, `resolveSignInRole()`). Non-school-domain accounts resolve to `student`; the comparison requires a full domain-label match, so `x@pochiu.edu.hk.evil.com` and `x@notpochiu.edu.hk` are rejected. Every caller — sign-in, home-page redirect, role-select page, admin educator queries, the teacher CSV importers — must use this module; no local copies.
2. **New teachers are auto-linked to all current (non-`Demo`) classes** when the account is created, through `adminLinkTeacherToAllClasses()` → `adminLinkEducators()` (the single `TeacherClass` write path). Linking happens **only at account creation** so an administrator can still revoke access by removing a teacher's classes.
3. **Auto-linking never includes non-school-domain accounts.** `adminFindEducators()` filters by school domain; `adminLinkTeacherToAllClasses()` re-verifies role + domain and fails closed (returns `0`, writes nothing) for anything else. `scripts/link-teachers-to-classes.ts` also prunes pre-existing links belonging to non-educator or non-school-domain accounts.
4. **CSV teacher imports reject non-school-domain rows** (`/api/import`, `/api/admin/import/teachers`) instead of creating accounts that would be demoted at their next sign-in.

## Consequences

- Teacher-facing data (roster, class lists, per-student answers, exports) is limited to school-domain staff; an outside Google account can no longer acquire the teacher role.
- Staff whose Google account is not on a school domain cannot be teachers; they resolve to `student`. Adding a second school domain means extending `SCHOOL_EMAIL_DOMAINS`.
- Because linking happens at account creation only, an administrator removing all of a teacher's classes revokes roster access until links are explicitly restored (re-run `npm run db:link:teacher-classes:apply`).
- Teacher CSV imports grant exactly the classes listed in the CSV (possibly narrower than the auto-link); run the repair script to widen.
- One-off remediation performed on 2026-10-08: 648 `TeacherClass` links created (24 classes × 27 educators), the non-school-domain account demoted to `student` and its 24 links removed (remaining 624 links = 24 classes × 26 school-domain educators).

## Evidence

- Contract tests: `src/shared/auth/__tests__/sign-in-role.test.ts` (role matrix incl. spoofed/foreign domains; source scans that the three call sites use the shared module and keep no local copies), `src/modules/admin/__tests__/admin-link-teacher-to-all-classes.test.ts` (idempotent upsert per class; fail-closed for non-school domain / non-educator / unknown account; `adminFindEducators()` domain filter), `src/app/api/__tests__/admin-classes-educator-link.test.ts` (route uses the canonical helper).
- Live verification (production DB): teacher `lamyt@pochiu.edu.hk` 0 → 24 taught classes; `resolveTeacherStudentClass(4A student)` `null` → `4A`; `GET /api/teacher/students` → 200 with 712 students / 24 classes; `GET /api/practice/history?view=day&includeAnswers=1` → 200 with 18 sessions / 83 answers; re-running the repair script after the demotion reports 26/26 links and 0 invalid links.
