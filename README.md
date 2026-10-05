# Ferrn Issue Control

A lightweight QA / issue accountability system for product teams.

## Core workflow

New -> In Progress -> Dev Done -> Awaiting Verification -> Resolved

Developers can start work and submit a fix. Only admins can verify and resolve an issue.

## Features
- Live issue board
- Developer assignment
- Screenshots / video evidence
- Comments and activity history
- Developer proof-of-fix submission
- Admin-only final resolution
- Reopen flow
- Priority and due dates
- Email notifications via Resend
- Supabase Auth, Postgres, Storage and Realtime

## Setup
1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Create a Storage bucket named `issue-files` if the SQL does not create it automatically.
4. Copy `.env.example` to `.env.local` and set the values.
5. Verify your sending domain in Resend and set `EMAIL_FROM`.
6. Run `npm install && npm run dev`.

## Roles
- `admin`: creates issues, assigns developers, verifies/resolves/reopens.
- `developer`: sees assigned/all issues, starts work, comments, uploads evidence, marks Dev Done.
- `qa`: can test/comment and move Dev Done to Awaiting Verification, but cannot resolve.

The database trigger blocks non-admin users from setting `resolved` even if they try to bypass the UI.

## First admin bootstrap
1. Deploy/open the app and request a magic sign-in link with your own email.
2. In Supabase SQL Editor, edit and run `supabase/bootstrap-admin.sql`.
3. Refresh the app. You now have the Admin role.
4. Click **Team** to add developers and QA testers. The system sends each person an invite.

## Accountability model
- Developers can move: `New/Reopened -> In Progress -> Dev Done`.
- QA can move: `Dev Done -> Awaiting Verification` and send failed work back to `Reopened`.
- Only Admin can set `Resolved`.
- A database trigger enforces these rules independently of the UI.
