# PCD @ Greensboro — Hack-a-Thon Gallery

Live gallery for the Processing and Community Day Hack-a-Thon, projected on the
big screen during the event.

**Live site:** https://pcd-hackathon-gallery-lilyxia99s-projects.vercel.app

## How it works

- `index.html` — the whole gallery: left grid + right stage, auto-rotating every
  15 seconds, fullscreen Present mode, submit form.
- `api/submissions.js` — a Vercel serverless proxy. The browser never sees the
  Notion token; the proxy reads and writes the Notion database below.
- Data source: the Notion database **PCD Hackathon** (inside the page
  "Hachathon 作品集"). The gallery polls it every 15 seconds, so edits in
  Notion — new rows, changed links, hiding a row — show up within ~15 s.
  A GIF link changed in Notion refreshes too; uploaded files get a new URL on
  every upload, so replacements never serve a stale cached copy.
- GIF / image / video file uploads go to the public Supabase Storage bucket
  `pcd-gallery` (path `hackathon/...`); pasted links work as well.
- Submission kinds: `sketch` (live p5.js / OpenProcessing link, played in an
  iframe) and `media` (GitHub link + screenshot / GIF / video).

## Notion columns

`Name` (title), `作者`, `主题` (GIFT / FREEDOM), `类型` (sketch / media),
`作品链接`, `GitHub`, `截图/GIF`, `显示` (checkbox — uncheck to hide a piece).

## Setup

- Vercel project environment variable `NOTION_TOKEN`: a Notion internal
  integration secret. The integration must be shared with the PCD Hackathon
  database (database ••• → Add connections).
- The old Supabase table `hackathon_submissions` is retired and no longer read.

## Event-day checklist

- In `index.html`, set `SHOW_DEMOS = false` and redeploy (push to `main`).
- Hide a piece instantly: uncheck its `显示` box in Notion.
- Submissions from the form land in Notion directly, so they can be edited or
  hidden there by hand afterwards.
