# Little Stars — School Management System

A complete management system for a **nursery (Baby, Middle, Top Class) and lower primary (P1–P2)** school: student registration with guardians, daily attendance, marks and report cards, school activities, inventory, the library, reports, and an audit trail. Rwandan defaults: **RWF**, **Africa/Kigali**, three terms per year.

| | |
|---|---|
| **Backend** | Node.js 20+, Express 4, TypeScript (strict), Prisma 5, MySQL 8, Zod, JWT in httpOnly cookies, Swagger |
| **Frontend** | Next.js 14 (App Router), Tailwind CSS, shadcn/ui-style Radix components, TanStack Query, React Hook Form + Zod, Recharts, framer-motion, next-themes |
| **Exports** | PDF (pdfkit, with the school logo letterhead) and Excel (exceljs) |
| **Tests** | Jest + Supertest: 55 tests covering auth, RBAC, teachers, marks and report cards, registration, attendance, stock movements and library loans |

![Dashboard](docs/screenshots/dashboard.jpg)

---

## Contents

- [Features](#features)
- [Running it for real (always on)](#running-it-for-real-always-on)
- [Quick start with Docker](#quick-start-with-docker)
- [Local setup without Docker](#local-setup-without-docker)
- [Default logins](#default-logins)
- [Environment variables](#environment-variables)
- [Commands](#commands)
- [API documentation](#api-documentation)
- [Project structure](#project-structure)
- [Roles and permissions](#roles-and-permissions)
- [Languages](#languages)
- [Screenshots](#screenshots)
- [Security notes](#security-notes)

---

## Features

**Typography and background.** Reading text, table data and form fields use **Satoshi**. **Cabinet Grotesk** is the voice of the interface: page titles (large, with an ink-to-blue blend), card and dialog titles, buttons, tabs, form labels, badges, table headings, the side menu and big numbers, premium typefaces from Indian Type Foundry (Fontshare). They are self-hosted, so pages never call a font service, and the same fonts are embedded in every PDF (report cards, ID cards, exports). Pages sit on a soft background of brand-colour glows with a fine grain, in light and dark versions. The side menu is midnight navy with gold and white stars drifting slowly upward (two layers at different speeds; still for reduced motion), and its labels are set in the heading typeface; the current page is a white pill marked in yellow. **Each section has its own background** in its own colour: a light pattern of related drawings, one large faint drawing in the corner, and a glow. The Library shows books and bookmarks, Attendance calendars and ticks, Marks trophies and stars, Inventory boxes and food, Activities party poppers and music, Teachers apples and graduation caps; single-area dashboard overviews use their area's background (`frontend/components/layout/section-backdrop.tsx`).

> **Font licence.** The fonts are free for the school's own use under the ITF Free Font License (`frontend/app/fonts/LICENSE-ITF-FFL.txt`), but the files may **not be modified or redistributed**. Keep the repository private, or remove `frontend/app/fonts/*.woff2` and `backend/assets/fonts/*.ttf` before publishing it. After a fresh clone, run `scripts/fetch-fonts.sh` to download them again. PDFs fall back to Helvetica if the backend fonts are missing; the web app needs them to build.

**Look and feel.** The sign-in screen plays a looping video of young pupils learning with their teacher behind a wash of the school colours. The same video plays in the Dashboard and My classes greeting banners. The video has no sound and a pause button, and people who prefer reduced motion see a still frame. It is ~2 MB (`frontend/public/media/classroom.{webm,mp4}`, poster `classroom-poster.jpg`). To use the school's own footage, replace those three files, keeping the names. **Star the puppy**, the school mascot, is an original drawing in code (`frontend/components/shared/puppy.tsx`): no image files, sharp at any size. It waves from behind the sign-in card and in the Dashboard and My classes banners, naps on every empty list ("No matching students"), and walks lost visitors back from the not-found page. It wags its tail, blinks and waves; the motion stops for people who prefer reduced motion. Faint paw prints and hearts decorate the page background behind the cards (not printed).

**Sign-in.** Admins and super admins land on the Dashboard after signing in; teachers land on My classes.

**One overview per section.** The Students, Attendance, Marks, Activities, Inventory and Library tiles each open an overview of that section only (`/dashboard?focus=attendance`, …), for an admin who only wants to follow one part of the school that day. Each overview has its own figures, charts and lists. For example, Attendance shows today's rate, registers taken, absent and late pupils, the 30-day trend and today's absentees; Marks shows the school average, pass rate, pupils below the pass mark, averages by class and the latest assessments. An "Open …" button leads into the section itself, and a row of buttons (Everything, Students, Attendance, Marks, …) switches between overviews.

**Dashboard.** Each staff member can **customize their dashboard** (Customize button): pick which of the 16 widgets to track. The choice is saved to their account and follows them to any device. Available widgets: KPI cards (students by level, today's attendance, upcoming activities, books on loan, low-stock and overdue alerts), charts (30-day attendance trend, students per class, boys/girls, stock value per month, library loans per month; each chart has a data-table view), lists (today's absentees, upcoming activities, recent registrations, low stock, overdue books) and quick actions.

**Students.**
- Five-step registration wizard: child and photo, guardians, medical, class, review.
- Registration links existing guardians for siblings.
- Admission numbers are generated automatically (`SCH-2026-0001`).
- Class capacity is enforced, and the wizard suggests a class from the child's age.
- The student list has table and card views, search (including guardian name or phone), filters, pagination, and Excel/PDF export.
- Each student has a profile with tabs for overview, guardians, an attendance calendar, activities, library loans and class history.
- Staff can change a student's status and promote a whole class at year end (Baby → Middle → Top → P1 → P2 → Graduated). Individual children can be held back.
- Printable PDF ID cards (front and back) and registration forms.
- Bulk import from Excel with a downloadable template and a per-row validation report.

**Attendance.**
- Pick a class and date to get a roster with photos.
- One-click status buttons, "Mark all present", arrival time, pick-up person (suggested from authorized guardians) and remarks.
- Future dates, weekends (configurable) and holidays are blocked. Edits to past days are recorded in the audit log with before/after values.
- A monthly calendar grid for printing, and reports by class, by student and for chronic absentees (threshold configurable). All reports export to PDF and Excel.

**Teachers and courses.**
- Administrators manage the course list (Mathematics, English, Kinyarwanda…) and add teachers with their post (Teacher, Head teacher, Director of studies, Teaching assistant) and the courses they teach in each class.
- Each teacher gets a registration number (`26TR001`: two-digit year, post code, sequence). It is emailed to their Gmail with a single-use activation link (valid 72 hours) where they confirm the number and choose a password.
- Teachers sign in with their registration number. They see **My classes** (their classes, courses and rosters, with shortcuts to attendance and to each course's marks), **Attendance** for those classes, and **Marks** for the courses they teach. Every other page and API route is closed to them.
- Only administrators set or reset a teacher's password; doing so signs the teacher out everywhere.

**Marks and report cards.**
- Teachers open **Marks**, pick the term and one of their class/course pairs, and create assessments: classwork, homework, quiz, test, project or exam, each with its date and maximum score. They then enter each pupil's mark on one screen (Enter moves to the next pupil; marks above the maximum are refused). Pupils can be marked absent (excused), and each mark can have a remark.
- **Every assessment counts.** A pupil's course result for the term is the total of their marks ÷ the total possible × 100. Excused absences and marks not yet entered are left out of that pupil's total.
- Teachers see **Course results** for their own courses (every assessment, total, percentage, grade), exportable to Excel and PDF. They cannot see other courses or classes.
- Admins and super admins can also enter marks for any class, and see **Class results**: every course's percentage per pupil, the average of all courses, the grade and the position in class (equal averages share a position).
- **Report cards (bulletins):** one A4 page per pupil, for a whole class or a single pupil. Each shows the pupil's details, position, the term's attendance, and a row per course with continuous assessment, exam, total, percentage, grade and remark. They also include the overall average, the grading key, comment lines and signatures.
- Grading scale: A 80–100 Excellent, B 70–79 Very good, C 60–69 Good, D 50–59 Fair, E below 50 Needs improvement. The pass mark is 50%.

**Activities.** Plan an activity for whole classes and/or individual students, with a budget. List and month/week calendar views. Mark an activity completed with outcome notes and actual cost. Each activity has a photo gallery and a PDF activity report.

**Inventory.**
- Categories, suppliers, and items with images and auto SKUs (`INV-00001`).
- Stock in (updates the weighted-average cost), stock out to a class or person, returns, damaged write-offs, and adjustments to a physical count.
- Every movement runs in a database transaction with an atomic check, so **stock can never go negative**, even with concurrent requests.
- Low-stock notifications and expiry warnings for food and medical items.
- Each item has a movement timeline. Reports cover stock levels, movements, consumption per class and valuation.

**Library.**
- Catalogue with covers, generated copy codes (`LIB-000123`) and printable label sheets.
- Issue a book to a student or staff member. The loan period and maximum books per student are configurable.
- Returns include a condition check; damaged copies are taken out of circulation. Books can be marked lost with a fine in RWF.
- A daily cron job marks overdue loans and notifies staff.
- Reports: most borrowed books, loans per class, overdue books.

**Reports center.** All 16 reports in one place, with date-range, term and class filters, an on-screen preview, print styles, and PDF/Excel export.

**Administration (super admin).** Staff users (create, edit, activate/deactivate, reset password), school profile and logo, academic years and terms, holidays, attendance and library rules, currency/timezone/language, and a filterable audit log with a before/after diff view.

**Everywhere.**
- Global search (Ctrl + K) and a notification bell with an unread count.
- Light, dark and system themes; a responsive layout with a mobile drawer.
- Skeleton loaders, empty states, confirmation dialogs and toasts.
- Keyboard focus rings and ARIA labels.
- **English, French and Kinyarwanda.** Everything the system writes itself is translated: every screen, message and form error, plus the PDFs (report cards, ID cards, registration forms, reports), Excel exports, notifications and emails. Dates and numbers follow the language too. Pick a language from the globe menu; the school's default (Settings → Regional) applies until someone chooses. Names and text that people type in (pupils, classes, courses, book titles, notes) stay as typed. See [Languages](#languages).

---

## Running it for real (always on)

On the school's computer, one command turns the system into background services that start at boot, restart if they crash, and back up every night. No Docker is needed:

```bash
npm run deploy      # production build + services (run again after every code update)
npm run setup:db    # once: move the data to the computer's permanent MySQL (asks for your sudo password)
```

- **Deploy** builds the fast production versions, applies migrations and installs three systemd user services: `school-web` (port 3000, open to the school network), `school-api` (port 4000, this computer only) and a nightly `school-backup` timer. Production settings, with their own secrets, live in `~/.config/school/api.env`.
- **Setup:db** creates the `school_db` database and a `school_app` user on MySQL port 3306 (data in `/var/lib/mysql`), copies the current data there and switches the app to it. Until you run it, the app uses the development database on port 3307, which lives in `/tmp` and is **erased when the computer restarts**.
- **Backups** go to `~/school-backups` every night at 02:30 (database and photos, kept 30 days). `npm run backup` makes one now. Copy that folder to another disk or a cloud drive regularly. Restore commands are at the top of `scripts/backup.sh`.
- **Useful commands:** `systemctl --user status school-api school-web`, `journalctl --user -u school-api -f` (live log), `systemctl --user restart school-web`.
- **Development:** `npm run deploy` stops the dev servers. To develop again, first run `systemctl --user stop school-api school-web` (they use the same ports), then `npm run dev:api` and `npm run dev:web`.
- Teachers on the school Wi-Fi open `http://<this computer's IP>:3000`; the deploy script prints the address. Put HTTPS in front (e.g. Caddy) before using it outside the school network.

---

## Quick start with Docker

Requires Docker with the Compose plugin.

```bash
cp .env.example .env
# Set the two JWT secrets (each at least 32 characters):
sed -i "s/^JWT_ACCESS_SECRET=.*/JWT_ACCESS_SECRET=$(openssl rand -hex 32)/; s/^JWT_REFRESH_SECRET=.*/JWT_REFRESH_SECRET=$(openssl rand -hex 32)/" .env

docker compose up -d --build              # MySQL, API (runs migrations on start), web app
docker compose exec backend npm run seed  # optional: load the demo school
```

Open **http://localhost:3000**. The API is on http://localhost:4000 and its docs are at http://localhost:4000/api/docs.

> The Docker files were written and syntax-checked but could not be run on the build machine (Docker was not installed there). The same code paths were verified without Docker, as described below.

---

## Local setup without Docker

Requirements: **Node.js 20+** (tested on 22) and **MySQL 8**.

### 1. Database

Either point the API at an existing MySQL server, or start a throw-away, user-owned MySQL instance (no root access needed):

```bash
scripts/dev-mysql.sh start   # MySQL on 127.0.0.1:3307, user school / school_pass, DB school_db
```

The script uses the system's `mysqld` binary with its own data directory in `/tmp/school-dev-mysql`. It is `/tmp` because Ubuntu's AppArmor profile only lets `mysqld` write there. The data does not survive a reboot; run `npm run seed` again afterwards.

If you use your own server instead, create a database and a user that can create databases (Prisma needs this for its shadow database during `migrate dev`, and the tests use a separate `school_test` DB).

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env        # adjust DATABASE_URL if you are not using scripts/dev-mysql.sh
# Put real secrets in .env: openssl rand -hex 32
npx prisma migrate deploy   # create tables
npm run seed                # demo data (wipes the database first!)
npm run dev                 # http://localhost:4000
```

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local  # BACKEND_URL=http://localhost:4000
npm run dev                 # http://localhost:3000
```

The browser only talks to the Next.js origin. Next rewrites `/api/v1/*` and `/uploads/*` to the API, so the auth cookies are first-party.

---

## Default logins

| Role | Email | Password |
|---|---|---|
| Super admin | `superadmin@school.rw` | `SuperAdmin@123` |
| Admin | `admin@school.rw` | `Admin@123` |
| Teacher | `26TR001` (registration number) | `Teacher@123` |

> **Change both passwords immediately** (Profile → Change password) on any real deployment.

The demo seed contains a full school:
- Settings and the 2026–2027 year with three terms, plus the previous year.
- Rwandan public holidays.
- Courses and five teachers: three active (`26TR001` teaches in P1 A and P2 A) and two still pending activation.
- Five classes and 60 active pupils with 100+ guardians, including shared guardians for siblings.
- 30 school days of attendance.
- Three marked assessments (classwork, quiz, mid-term test) for every course of every class this term, plus an unmarked P2 A Mathematics quiz for the demo teacher.
- 10 activities.
- 8 inventory categories, 6 suppliers, 42 items and 200+ stock movements.
- 50 books with 104 copies, plus returned, active, overdue and lost loans.
- Sample notifications.

---

## Environment variables

### Backend (`backend/.env`)

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | — | MySQL connection string |
| `TEST_DATABASE_URL` | `…/school_test` | Separate DB for `npm test`; it is **reset** by the tests |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | — | At least 32 characters each; the server refuses to start otherwise |
| `ACCESS_TOKEN_TTL_MIN` | `15` | Access token lifetime (minutes) |
| `REFRESH_TOKEN_TTL_DAYS` | `7` | Refresh token lifetime (days) |
| `PORT` | `4000` | API port |
| `CORS_ORIGIN` | `http://localhost:3000` | Allowed browser origin(s), comma-separated |
| `APP_URL` | `http://localhost:3000` | Used in password-reset links |
| `COOKIE_SECURE` | `false` | Set to `true` behind HTTPS |
| `TRUST_PROXY` | `1` | Number of reverse proxies in front of the API (see [Security notes](#security-notes)) |
| `LOGIN_RATE_LIMIT` | `10` | Login attempts per IP per 15 minutes |
| `UPLOAD_DIR` / `MAX_UPLOAD_MB` | `uploads` / `2` | Image storage folder and size limit |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | — | Optional. Without SMTP, reset links are printed to the API console |
| `LOG_LEVEL` | `info` | pino log level |
| `DISABLE_CRON` | `false` | Turn off the daily overdue and stock-alert jobs |

### Frontend (`frontend/.env.local`)

| Variable | Default | Description |
|---|---|---|
| `BACKEND_URL` | `http://localhost:4000` | Where Next.js proxies `/api/v1` and `/uploads`. Resolved at **build time** |

### Docker (`.env` in the repository root)

See `.env.example`: MySQL credentials, JWT secrets, `APP_URL`, ports and optional SMTP.

---

## Commands

| Where | Command | What it does |
|---|---|---|
| root | `npm run install:all` | Install both apps |
| root | `npm run db:start` / `db:stop` | Start or stop the local dev MySQL |
| root | `npm run deploy` / `setup:db` / `backup` | Install as always-on services / move data to the permanent MySQL / back up now |
| backend | `npm run dev` | API with reload |
| backend | `npm run build` && `npm start` | Production build and run |
| backend | `npx prisma migrate deploy` | Apply migrations |
| backend | `npm run prisma:migrate` | Create a new migration after editing `schema.prisma` |
| backend | `npm run seed` | Wipe and load the demo data (refuses to run with `NODE_ENV=production` unless `SEED_FORCE=true`) |
| backend | `npm test` | Jest + Supertest against `TEST_DATABASE_URL` |
| backend | `npm run lint` / `typecheck` / `format` | Code quality |
| frontend | `npm run dev` | Web app with hot reload |
| frontend | `npm run build` && `npm start` | Production build and run |
| frontend | `npm run lint` / `typecheck` / `format` | Code quality |
| root | `npm run i18n:check` | Fails if any text is not translated into French and Kinyarwanda (runs both apps' checks) |

---

## API documentation

- **Swagger UI:** http://localhost:4000/api/docs (also proxied at http://localhost:3000/api/docs)
- **OpenAPI JSON:** http://localhost:4000/api/docs.json

The OpenAPI document is generated from the same Zod schemas that validate each request, so the docs cannot drift from the code. To try requests in Swagger, call `POST /api/v1/auth/login` first; it sets the cookies.

All endpoints live under `/api/v1`. Responses have the shape `{ success: true, data, meta? }` or `{ success: false, error: { code, message, details? } }`. Lists accept `page`, `pageSize`, `search`, `sortBy`, `sortOrder` and module-specific filters. Most lists and reports also accept `format=xlsx|pdf`.

---

## Project structure

```
backend/
  prisma/            schema.prisma, migrations/, seed.ts
  src/
    config/          env (Zod-validated), prisma, logger
    middlewares/     auth (JWT + RBAC), upload (type/size/magic-byte checks), error handler
    modules/<name>/  routes.ts · controller.ts · service.ts · schema.ts
                     (auth, users, settings, academic, classes, students, attendance,
                      activities, inventory, library, notifications, reports, dashboard, search, audit,
                      teachers, courses, marks)
    jobs/            node-cron: overdue loans, low-stock/expiry sweep
    utils/           typed router + OpenAPI builder, audit, export (PDF/Excel), dates, pagination…
  tests/             Jest + Supertest suites
frontend/
  app/(auth)/        login, forgot-password, reset-password, activate
  app/(dashboard)/   dashboard, students, classes, teachers, courses, my-classes, attendance, marks,
                     activities, inventory, library, reports, users, settings, audit-logs, profile
  components/        ui/ (shadcn-style primitives), layout/, charts/, forms/, tables/, shared/
  lib/               api client (auto refresh), auth context, i18n, utils
  hooks/  types/  messages/ (en, fr, rw)
scripts/dev-mysql.sh
docker-compose.yml  DECISIONS.md
```

---

## Roles and permissions

| Capability | Super admin | Admin | Teacher |
|---|:--:|:--:|:--:|
| Students, guardians, activities, inventory, library, reports, dashboard | ✅ | ✅ | ❌ |
| Attendance (take, monthly calendar) | ✅ | ✅ | own classes |
| Attendance reports | ✅ | ✅ | ❌ |
| Marks: assessments, marks entry, course results | ✅ any class | ✅ any class | own courses and classes |
| Class results, report cards (bulletins) | ✅ | ✅ | ❌ |
| My classes (own courses, classes and rosters) | — | — | ✅ |
| Teachers and courses (add, assign, set teacher passwords) | ✅ | ✅ | ❌ |
| Soft delete (archive) records | ✅ | ✅ | ❌ |
| Permanently delete records; restore archived students (API: `POST /students/:id/restore`) | ✅ | ❌ | ❌ |
| Classes (create/edit/delete), academic years, terms, holidays | ✅ | read only | ❌ |
| School settings and rules | ✅ | ❌ | ❌ |
| Staff users | ✅ | ❌ | ❌ |
| Audit logs | ✅ | ❌ | ❌ |
| Own profile and photo | ✅ | ✅ | ✅ |
| Change own password | ✅ | ✅ | ❌ (set by an administrator) |

Rules are enforced by the API on every route; a route is administrator-only unless it explicitly allows teachers. The UI also hides actions the current role cannot use, and sends a teacher who opens any other page back to My classes. Additional safeguards:
- A user cannot deactivate, demote or delete themselves.
- There must always be at least one active super admin.

---

## Languages

The interface, the API's messages and the generated files come in English, French (`fr`) and Kinyarwanda (`rw`).

**How the language is chosen.** A `locale` cookie set from the globe menu, else the school's default language (Settings → Regional), else English. The web app sends the language with every API call, so error messages, reports, PDFs and Excel files come back in it. Emails to teachers use the school's default language. Notifications are stored in English and translated for each reader.

**How translations work.** The English sentence is the key: `t('Register student')`, `t('{count} pupils', { count })`, `plural(n, '{count} pupil', '{count} pupils')`.

| Where | Dictionaries | Translate with |
|---|---|---|
| Web app | `frontend/messages/fr.json`, `rw.json` | `t`, `tRich` (sentences with bold text or links), `plural` from `@/lib/i18n`; `enumLabel()` for status codes |
| API | `backend/src/i18n/fr.json`, `rw.json` | `t`, `plural`, `label()` for status codes, `storedText()` for notifications |

A missing translation shows the English text. `npm run i18n:check` scans both apps and fails when a text on screen is not wrapped for translation or has no French or Kinyarwanda entry, so run it after adding or changing any text. When one short English word needs two meanings, prefix a context: `t('Grade remark|Good')` shows "Good" in English and has its own translations.

**Adding a language** means adding its code to `LOCALES` (`frontend/lib/locale.ts`) and `isLang` (`backend/src/i18n/index.ts`), plus a JSON file on each side.

> The Kinyarwanda translations were written without a native-speaker review. Have a Kinyarwanda-speaking teacher read through `rw.json` before the school relies on them.

Browsers do not ship Kinyarwanda date names, so the web app supplies them itself (`frontend/lib/intl-fallback.ts`). The native date and time pickers in forms follow the browser's own language.

---

## Screenshots

| | |
|---|---|
| ![Login](docs/screenshots/login.jpg) | ![Dashboard, dark mode](docs/screenshots/dashboard-dark.jpg) |
| **Login**: split screen with a playful illustration | **Dashboard** in dark mode |
| ![Registration wizard](docs/screenshots/register.jpg) | ![Attendance](docs/screenshots/attendance.jpg) |
| **Registration wizard**: five steps | **Take attendance**: one-click statuses |
| ![Library](docs/screenshots/library.jpg) | |
| **Library catalogue** | |

---

## Security notes

- **Tokens and passwords.**
  - Access (15 min) and refresh (7 days) tokens are sent only as **httpOnly, SameSite=Lax** cookies and are never included in response bodies.
  - Refresh tokens are random and stored as an HMAC. They **rotate** on every refresh, and **reusing** an old token revokes all of that user's sessions.
  - A password change or reset revokes every refresh token, and access tokens carry the password version they were issued under, so other sessions stop working at once rather than when their access token expires.
  - Passwords are hashed with bcrypt (cost 12) and must be at least 8 characters with upper case, lower case and a digit.
- **Login protection.**
  - After 5 wrong passwords, the account is locked for 15 minutes.
  - The login route is also rate-limited per IP.
  - Error messages do not reveal whether an account exists.
  - Password resets use single-use tokens that expire after 1 hour.
- **Behind a proxy.**
  - The API reads the client IP from `X-Forwarded-For`, trusting `TRUST_PROXY` hops. In production, put a reverse proxy (nginx, Traefik…) in front of the web app so it sets that header.
  - When clients reach the Next.js server directly (as in local development), the header is client-controlled, so per-IP limits can be bypassed. Per-account lockout still applies.
- **Input.**
  - Every body, query and path parameter is validated with Zod, and HTML tags are stripped from text input.
  - Uploads must be JPEG, PNG, WEBP or GIF, at most 2 MB. Their contents are checked by magic bytes, and files get random names.
  - Excel imports are parsed in memory.
- **Headers and data integrity.**
  - helmet on the API; CORS limited to `CORS_ORIGIN`; X-Frame-Options and nosniff headers on the web app.
  - All stock and library operations run in DB transactions with conditional updates.
  - Every create, update and delete, plus logins, is written to the audit log.
