# Ibex Student CRM

A responsive, login-protected student and payment CRM starter for Ibex Overseas Education. It uses **React + Vite** for the website and **Supabase** for authentication, a hosted PostgreSQL database, and private receipt uploads.

## Features

- Login with email/password (no public sign-up page)
- Add, edit, search, filter, and delete student records
- Track country, university, program, application status, contact information, service fee, and notes
- Record multiple payments per student with date, method, transaction reference, and notes
- Upload receipt screenshots or PDFs (max 10 MB each)
- Dashboard totals for expected fees, recorded collections, and pending balances
- Responsive layout for desktop and mobile
- Row-level security: authenticated users only see rows they own; receipt bucket is private

## Important before using real student data

This is a starter CRM, not a fully audited financial system. Configure and test access controls before adding real data. Do not store passport scans, passwords, bank logins, or other unnecessary sensitive documents here. Give access only to staff who need it, use strong unique passwords, enable MFA for the Supabase account, and maintain backups. If multiple staff need shared access to the same student records, the database design must be changed to use an organization/team membership model; this starter intentionally isolates each user's records.

## 1. Create your Supabase backend

1. Create a project at https://supabase.com.
2. In the Supabase project, open **SQL Editor**, create a query, paste all of `supabase-setup.sql`, and run it.
3. Open **Project Settings → API** (or **Connect**, depending on the dashboard version). Copy the Project URL and the **publishable/anon** client key.
4. Open **Authentication → Users** and create your own user with your email and a strong password. Keep public sign-ups disabled. If you later need staff accounts, create them deliberately and review access requirements.
5. In **Authentication → URL Configuration**, add your local URL during testing and your deployed website URL after deployment.

## 2. Run locally

Install Node.js (LTS), then open a terminal in this folder:

```bash
npm install
cp .env.example .env
```

On Windows PowerShell, use `Copy-Item .env.example .env` instead of `cp`.

Edit `.env` and set:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
```

Then run:

```bash
npm run dev
```

Open the local URL Vite prints, usually `http://localhost:5173`.

**Never use a Supabase service-role key in frontend code or commit your `.env` file to GitHub.** The public/anon key is designed for browser use only when Row Level Security policies are enabled correctly.

## 3. Put the code on GitHub

1. Create a new private GitHub repository, for example `ibex-student-crm`.
2. Upload the project files, excluding `.env` and `node_modules`.
3. In the repository settings, confirm `.env` is not tracked. If you accidentally committed credentials, rotate them.
4. You can deploy the frontend on Vercel or Netlify (recommended for the simplest setup) and connect the GitHub repository. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under the deployment project's environment variables.
5. Add the final deployment URL to Supabase Authentication → URL Configuration, then redeploy if needed.

GitHub Pages can host a static frontend, but it does not provide a database or secure login by itself. The Supabase backend is what makes the data available from anywhere after login.

## 4. Test before entering real records

- Log in and add a test student.
- Add a test payment and upload a receipt.
- Confirm pending balance decreases correctly.
- Open the site in another browser/device and log in to verify records persist.
- Try opening a receipt while logged out; it should not be publicly accessible.
- If adding multiple staff, do not share one login. Decide whether staff should have separate, shared-team access before expanding.

## Current scope / limitations

- Currency is currently PKR; change the `money()` formatter in `src/main.jsx` if needed.
- Payment totals use the amounts you manually record; this app does not connect to a bank or verify a transfer automatically.
- It prevents public self-registration but does not yet provide an in-app admin user manager.
- Deleting a student deletes their payment rows through the database relationship. It does not automatically delete old receipt files from storage, so periodically review storage usage or add a cleanup function.
- This version is for a single owner per record. A team CRM with role-based permissions, audit logs, exports, reminders, and multi-user shared records should be a planned next iteration.
