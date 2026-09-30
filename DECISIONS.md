# Design decisions

The brief left several points open. Each decision below is recorded with the reasoning, so it can be revisited.

## Stack and versions

| Decision | Why |
|---|---|
| **Express 4, Prisma 5, Zod 3, Next.js 14.2, Tailwind 3, React 18** rather than the newest majors (Express 5, Prisma 7/8, Zod 4, Next 16, Tailwind 4) | These are stable, widely documented majors that meet the brief ("Next.js 14+"). The newer majors change configuration formats (Prisma 7 client generation, Tailwind 4 CSS config) and add risk without adding features this app needs. Next 14.2.35 is the latest patched 14.x. |
| **bcryptjs** instead of native `bcrypt` | It uses the same algorithm and hash format, but has no native build step, which makes installs and Docker builds more reliable. Cost factor 12. |
| **pino** for logging | It is fast, logs structured JSON, and has built-in redaction of cookies, authorization headers and passwords. `pino-pretty` is used in development. |
| **shadcn/ui-style components written into `components/ui`**, built on Radix primitives | This is the same approach as the shadcn CLI (code you own, based on Radix) without an interactive generator step. |
| **Integer auto-increment ids** | They are simple and readable in URLs and audit logs, and they are used to derive `INV-00001` and `LIB-000123` codes without race conditions. |

## Architecture

- **Typed route builder (`backend/src/utils/router.ts`).** Each route is declared once with its Zod schemas and allowed roles. The builder then:
  - applies authentication and RBAC;
  - validates and sanitizes the body, query and params;
  - wraps the response in `{ success, data, meta }`;
  - registers the route in the **generated OpenAPI spec**.

  The docs therefore always match the code. The prescribed per-module file layout (`routes / controller / service / schema`) is kept. Three small read-only modules (notifications, audit, search) keep everything in `routes.ts`.
- **One export engine (`utils/export.ts`).** Every list and report returns the same `Report` shape: title, columns, rows and summary. The same shape renders as JSON for the on-screen preview, as Excel (styled header, frozen row, number formats) and as a PDF (school letterhead with logo, repeated table header, page numbers). The Reports Center lists all reports through a single registry.
- **Same-origin API through Next.js rewrites.** The browser only talks to the web app's origin, and `/api/v1/*` and `/uploads/*` are proxied to Express. This means:
  - the auth cookies are first-party (`SameSite=Lax`), which also blocks cross-site form posts;
  - the Next.js middleware can see the session cookie and redirect to `/login` before a protected page renders;
  - no CORS setup is needed in production.

  CORS is still configured for tools that call the API directly.
- **Route protection is two-layered.** Middleware checks that a session cookie exists; the API validates every request. The API client refreshes an expired access token automatically, once per burst of requests.
- **Calendar dates are `DATE` columns handled as `YYYY-MM-DD` strings.** "Today" is computed in the school timezone from settings (default Africa/Kigali), so dates never shift with the server's timezone.

## Business rules

These cover points the brief did not specify.

- **Admission numbers:** `{prefix}-{admission year}-{0001}`. The sequence restarts each year, and the prefix is configurable (`SCH` by default). If two registrations race for the same number, the unique constraint catches it and the request retries.
- **Age → class suggestion:** Baby 3, Middle 4, Top 5, P1 6, P2 7, based on age today. It is only a suggestion; staff can pick any class that still has seats.
- **Class capacity** is checked on registration, class change, reactivation and promotion. Capacity cannot be set below the current number of active students.
- **Promotion** moves active students to the next grade's class. It prefers the class with the same section, falls back to any class of that grade, or uses an explicit target class. Selected children can be held back. P2 pupils are marked `GRADUATED`. Each promotion writes an `Enrollment` row, so class history is complete.
- **Attendance rate = (Present + Late) ÷ days recorded.** Excused and Sick count as absences for the rate. They remain visible separately in every report.
- **Attendance rules:**
  - No future dates, no holidays, and no weekends unless enabled in Settings.
  - One record per student per day (a unique constraint); saving a sheet updates existing records instead of adding new ones.
  - Every edit is audit-logged with per-student before/after values, and edits to past days are flagged (`pastEdit: true`).
  - A record's term is detected from its date.
- **"Chronic absentee"** means an attendance rate below the configurable threshold (80% by default) within the chosen term or date range.
- **Stock:**
  - Movements store a positive quantity for IN, OUT, DAMAGED and RETURN. For ADJUSTMENT, staff enter the **physically counted quantity**, and the stored value is the signed difference.
  - A stock-in with a unit cost updates the item's **weighted-average cost**, so the stock valuation stays accurate.
  - Stock can never go negative. The decrement is a single conditional `UPDATE … WHERE quantity >= n` inside the transaction, so concurrent stock-outs are safe; a test proves this.
  - Low-stock alerts are sent when an item reaches its reorder level: at most one notification per item per day, plus a daily 06:00 sweep. Expiry warnings cover items expiring within 30 days, for categories marked *perishable*.
- **Library:**
  - A copy is claimed atomically (`AVAILABLE → BORROWED`), so the same copy cannot be issued twice.
  - Book counters (`totalCopies`, `availableCopies`) are recalculated from the copies inside each transaction. Lost copies are excluded from the total.
  - Overdue fine per day: 0 RWF by default, which is common for nursery libraries; it is configurable. The lost-book fine defaults to 5,000 RWF. Damage fines are entered when the book is returned.
  - Copies returned as DAMAGED are taken out of circulation until someone marks them available again.
  - Loans are marked OVERDUE by a cron job every day at 06:00 in the school timezone, and once when the server starts.
  - Staff can borrow books by name (`borrowerName`); the per-student limit does not apply to them.
- **Soft delete:** records get a `deletedAt` timestamp and are hidden everywhere. Only a super admin can use `?hard=true` or restore an archived student.
  - When a unique field could block a new record, soft-deleted rows free it: a user's email becomes `deleted-…@deleted.local`, and a class section, SKU or category name gets a suffix.
  - Hard-deleting a student keeps their past library loans for records: the borrower name is kept and the student link is removed.
- **Users:**
  - Deactivating a user or resetting their password revokes all of their sessions immediately.
  - Users cannot change their own role, deactivate themselves or delete themselves.
  - The system blocks any action that would leave no active super admin.
- **Teachers:**
  - Teachers are `User` rows with the `TEACHER` role, a post and a registration number (`{yy}{post}{seq}`, e.g. `26TR001`: the year it was issued, the post code, and a sequence that restarts each year per post). They sign in with the registration number; administrators keep signing in with email.
  - A new teacher cannot sign in until they activate the account through the emailed link (single-use, 72 hours), confirming their registration number and choosing a password. Administrators can resend the link.
  - Only administrators set a teacher's password afterwards; teachers cannot change it themselves. They can edit their name, phone and photo.
  - Teachers are kept out of the staff Users list and the Users API, and are managed from the Teachers page by both admin roles.
  - Class access comes from course assignments: a teacher sees and takes attendance only for classes they teach a course in. A `TeacherAssignment` is unique per teacher, course and class.
- **Marks:**
  - An `Assessment` belongs to one class, course and term; its class, course and term cannot change after creation. Its date must fall inside the term. Marks are unique per assessment and pupil, and a maximum cannot be lowered below a mark already given.
  - **Every assessment counts, weighted by its maximum:** course result = Σ marks ÷ Σ maximums. There are no separate weights for continuous assessment and exams. The report card still shows the two parts separately (exam = assessments of type Exam).
  - **Excused absence and blank marks are left out** of that pupil's total rather than counted as zero, so a mark not yet entered never pulls a pupil down. A school that wants absences to count as zero can enter 0.
  - **Class average = the mean of the pupil's course percentages**, so every course weighs the same whatever its number of assessments. Position is ranked by that average; equal averages share a position.
  - **Who is in a class for a term:** in the current year, the class's active pupils, plus anyone who already has a mark there. Pupils who moved or left keep their results, and past terms stay correct after promotion.
  - Teachers can edit marks at any time; every change is audit-logged with before/after values per pupil. Locking a term's marks is a possible next step.
  - Grading scale A–E with a 50% pass mark (see the README). It is a constant in `modules/marks/service.ts`, not yet a setting.
- **Session invalidation on password change:** access tokens carry a `pwd` claim with the user's `passwordChangedAt` in milliseconds, and the API rejects tokens whose value differs. JWT `iat` has one-second precision, so comparing it with the change time either let a token from the same second through or rejected the fresh token issued with the change.
- **Password reset:** single-use token, valid for 1 hour. Without SMTP settings, the link is printed to the API console, as the brief requested. The response never reveals whether an email address has an account.

## Security choices

- **Login protection:**
  - Per-IP rate limit on login (10 per 15 minutes, `LOGIN_RATE_LIMIT`).
  - Per-account lockout: 5 failures lock the account for 15 minutes (the brief's rule).
  - A general API limit of 3,000 requests per 15 minutes per IP.
- **Client IP behind proxies.** `trust proxy` is set from `TRUST_PROXY` (default 1, which covers the Next.js rewrite). In testing, Next.js passes the client's `X-Forwarded-For` header through **unchanged**. When the app is reached directly without a real reverse proxy, a client can therefore spoof its IP and get around the per-IP limit. Per-account lockout still applies. Production deployments should put nginx or Traefik in front and set `TRUST_PROXY` to the number of hops. This is documented in the README.
- **Uploads:**
  - The MIME type must be on an allow-list, and the file's magic bytes are checked after upload, so a renamed file is rejected.
  - Maximum size 2 MB; up to 10 photos per activity request.
  - Files get random names; client file names are never used.
  - Static files are served with `nosniff`.
- **Sanitization:** HTML tags are stripped from all string inputs, except password and token fields. Prisma uses parameterized queries; the few raw queries use tagged templates.
- **Audit log:** covers every create, update and delete, plus status changes, promotions, imports, stock movements, library issues and returns, and logins (including failures) and logouts. Secret fields are removed before writing.

## Frontend and UX

- **Palette** as specified. Status colours are consistent everywhere: present green, absent red, late amber, excused blue, sick purple.
- **Chart colours.** The two-series colours (royal blue and coral) were **validated with a colour-vision-deficiency checker**. Separate steps were chosen for dark mode (`#6F86F2` / `#E5533F`) rather than reusing the light values.
  - The gender split is shown as a labelled split bar rather than a two-slice pie.
  - Every chart has a table-view toggle for accessibility.
  - Charts do not animate for users who prefer reduced motion.
- **URL-synced list state:** page, search, sort and filters live in the query string. Filtered views can be shared, dashboard links work (for example `/library/loans?status=OVERDUE`), and the back button restores the view.
- **i18n: English text as the key.** `t('Register student')` rather than keys like `students.register`: the code stays readable, a missing translation falls back to real English, and a script can prove coverage. `npm run i18n:check` parses the code (TypeScript AST), fails on any text on screen that is not wrapped for translation, and checks that French and Kinyarwanda have every string with the same `{placeholders}`.
  - Whole sentences are translated, never fragments. Counts use `plural()` with the language's own rules (French treats 0 as singular), and sentences with bold text or links use `tRich()`.
  - Switching language re-renders the whole app, keyed on the locale. That way even texts computed outside React follow, at the cost of losing unsaved form input on switch.
  - The API keeps each request's language in async-local storage, so services, PDF and Excel builders call `t()` without passing the request around.
  - Notifications are stored in English and matched against the dictionary's templates (`"{name}" is low on stock…`) when read. People with different languages each see their own, and existing rows needed no migration.
  - Names and free text typed by users are data and are not translated.
- **Typefaces.** Satoshi (text) and Cabinet Grotesk (headings) from Fontshare replace Inter and Nunito for a more premium, distinctive look without licence fees. Satoshi was checked for tabular figures (`tnum`, used in every table) and for the accented letters French needs. Cabinet Grotesk has no tabular figures, so it is only used for headings and single big numbers. Both are self-hosted (`next/font/local`) as the official, unmodified variable WOFF2 files, which the ITF Free Font License allows for the school's own apps; subsetting or converting them is not allowed, so no build step touches them. PDFs embed the official static TTFs, registered under the Helvetica names so the drawing code is unchanged. Satoshi's zero looks like a capital O, so letter-and-digit codes such as registration numbers are shown in the monospace font.
- **Background video.** The demo uses the stock clip "Children and her teacher learning didactically" from Mixkit (free licence, commercial use, no attribution required), rather than footage of real pupils, which would need parental consent. It is re-encoded without audio as WebM (VP9) and MP4 (H.264, fast-start), about 2 MB each. It appears only on the sign-in screen and the greeting banners: behind forms and tables it would hurt readability and cost CPU on older school computers. The middleware lets `.mp4`/`.webm` through so the sign-in page can load it before login.
- **`<img>` instead of `next/image`:** images are user uploads served through the API proxy, so Next's optimizer would add work without benefit. The ESLint rule is turned off for this reason.

## Seed data

- It wipes the database, and refuses to do so when `NODE_ENV=production` unless `SEED_FORCE=true`. It is deterministic (seeded random numbers), so every run produces the same school.
- It includes the 2026–2027 year (Term 1 starts 17 Aug 2026) and the previous year, so class history and 30 school days of attendance fit within the current term.
- Three pupils have poor attendance, so the chronic-absentee report has results.
- Some inventory items are left low or out of stock, one medical item has expired, and some food expires soon.
- The P2 A class is left without attendance for today, so a demo has something to do.

## Development environment notes

- **Docker was not available** on the build machine, and the system MySQL requires root credentials. `scripts/dev-mysql.sh` runs a separate, user-owned MySQL 8 instance on port 3307 with its data in `/tmp` (Ubuntu's AppArmor profile for mysqld only allows `/tmp` and `/var/lib/mysql`). The Dockerfiles and `docker-compose.yml` were written and checked for syntax, but **not run**.
- The test suite uses a separate `school_test` database, which is reset before each run. The reset refuses to run against a database URL that doesn't contain "test".

## Known limitations and possible next steps

- The Kinyarwanda translations need a review by a native speaker. The native date and time pickers follow the browser's language rather than the app's.
- Report cards are per term; there is no annual (three-term) report yet. The comment lines are for handwriting; there is no field to type comments into the system.
- There is no fees or payments module (it was not in scope). Fines are recorded and can be marked paid, but there is no receipt flow.
- Emails need SMTP to be configured. Notifications are in-app only (no SMS).
- Photos are stored on local disk (a Docker volume). Multi-server deployments would need S3-compatible storage.
- The bulk import creates one guardian per row. Siblings imported this way get separate guardian records, which can be linked later from the profile.
