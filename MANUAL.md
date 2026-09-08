# 🥋 Karate Tournament Manager — User Manual

Everything you need to run a tournament, from installing the app to announcing the
winners on the projector. No internet, no Docker — the whole event runs on one PC.

---

## Table of contents

1. [What the app does](#1-what-the-app-does)
2. [Requirements](#2-requirements)
3. [Installation](#3-installation)
4. [Running the app](#4-running-the-app)
5. [Logging in & roles](#5-logging-in--roles)
6. [Configuration (admin)](#6-configuration-admin)
7. [Importing fighters](#7-importing-fighters)
8. [Managing fighters](#8-managing-fighters)
9. [Auto-grouping into categories](#9-auto-grouping-into-categories)
10. [Editing a category](#10-editing-a-category)
11. [Running order on a tatami](#11-running-order-on-a-tatami)
12. [Running the fights (brackets)](#12-running-the-fights-brackets)
13. [Timers](#13-timers)
14. [Podium & announcements](#14-podium--announcements)
15. [Projector & print](#15-projector--print)
16. [Export & reset](#16-export--reset)
17. [Language & layout](#17-language--layout)
18. [Moving to another computer](#18-moving-to-another-computer)
19. [Publishing to Git](#19-publishing-to-git)
20. [Troubleshooting](#20-troubleshooting)

---

## 1. What the app does

- **AI auto-grouping** — splits your roster into fair divisions by WKF-style age
  bands, weight, and gender. A 5-year-old is never matched against a 20-year-old.
- **Single-elimination brackets** — up to 8 fighters, quarter/semi/final, plus a
  bronze match for 3rd place. Byes are placed automatically.
- **Live tatami operation** — one fight runs at a time, per-bout and break timers,
  winner decision (ippon/points/etc.), result locking and revert.
- **Live sync** — every change appears instantly on all screens over WebSocket.
- **Podium** — announce winners full-screen on every projector.
- **Roles** — admin, tatami editor (one mat), and read-only viewer/projector.
- **3 languages** — English, Russian, Hebrew (with right-to-left layout).

---

## 2. Requirements

- **Node.js 20 or newer** — <https://nodejs.org>
- Windows, macOS or Linux. (Scripts below are for Windows; other OSes use the
  manual commands.)
- A modern browser (Chrome, Edge, Firefox).

---

## 3. Installation

### Windows (one click)

1. Install Node.js 20+.
2. Double-click **`install.bat`**.
   - To also load 200 demo fighters: `install.bat demo`
   - To skip the production build: `install.bat nobuild`
3. Wait for **“Installation complete!”**. **Write down the admin username and
   password** printed during the *seed* step — you need them to log in.

The installer:
- creates `server\.env` with a unique security key,
- installs all dependencies,
- creates the SQLite database (`data\karate.sqlite`),
- seeds the first admin, default belts and event,
- builds the production bundle.

### Any OS (manual)

```bash
npm install
npm run prisma:generate
npm run prisma:push
npm run seed         # or npm run seed:demo
npm run build
```

---

## 4. Running the app

| Mode | Command | Open |
|---|---|---|
| **Development** (hot reload) | `npm run dev` | http://localhost:5173 |
| **Production** (single server, no port in URL) | `npm run serve` | http://localhost |

- `npm run serve` listens on **port 80**, so people connect by just typing the
  computer’s address (e.g. `http://192.168.1.20`). On Windows, start the terminal
  **as Administrator** so it can use port 80.
- Other devices on the same Wi-Fi/LAN reach it at `http://<this-PC-IP>`.

---

## 5. Logging in & roles

Open the app and log in. The seed creates these default accounts:

| Role | Username | Password |
|---|---|---|
| **Admin** | `admin` | `admin123` |
| Arena editor *(only with `npm run seed:demo`)* | `tatami1`, `tatami2`, `tatami3` | `tatami123` |

> ⚠️ **Change the admin password immediately** after the first login (Configuration →
> Users), especially before exposing the app on a network. You can seed different admin
> credentials by setting `ADMIN_USERNAME` / `ADMIN_PASSWORD` in `server/.env` before seeding.

| Role | Can do |
|---|---|
| **admin** | Everything: configuration, import, grouping, all tatami, users. |
| **tatami_editor** | Run fights **only on their assigned tatami**. |
| **viewer / projector** | Read-only public screens. No login needed for the projector. |

Create more users under **Configuration → Users** and assign a tatami to each
editor. The server enforces access: a tatami-1 editor cannot change tatami-2.

---

## 6. Configuration (admin)

All under the **Configuration** section of the sidebar.

### Branding
- Event **title** and subtitle, **logo** upload, **accent colour**.
- **Corners**: the two fighter corners default to **AO (blue, top)** and
  **AKA (red, bottom)**. You can rename them and change the colours (useful for
  other martial arts).

### Tatami setup
- Set how many mats you have, name them, upload a per-mat or default illustration,
  and enable/disable mats.

### Ranks (belts)
- Create belts with a name, short code, and colour.
- **Striped belts** are supported — set a stripe colour and count (e.g. *Orange /
  black stripe*).
- **Drag to reorder** — the order defines seniority (used for rank-based seeding).
- Add **aliases** so imported spreadsheets with different spellings still match.

### Settings
- **AI provider** for grouping: **Local** (default, fully offline) or an external
  LLM (Claude / OpenAI / Gemini) with an API key.
- **Band widths** — how tight weight categories are.
- **Bronze mode** — single bronze match (default) or two bronze medals.

---

## 7. Importing fighters

1. Go to **Import**.
2. **Download the template** (Excel or CSV). It comes with **10 filled-in example
   rows** and a second sheet listing every configured belt name — use those exact
   names in the `rank` and `teacher_rank` columns so nothing breaks.
3. Columns: `first_name, last_name, school, teacher_name, teacher_rank, rank, age,
   weight, gender, city, country`. Required: **first_name, last_name, rank, age,
   weight**.
4. Upload your file (`.xlsx` or `.csv`; UTF-8 **and** Windows-1251 supported).
5. Check the **preview** — bad rows are flagged by row number with the reason.
   Unknown belts can be mapped to a configured rank.
6. Confirm. The import is **all-or-nothing** (never a partial commit) and handles
   200+ rows.

> Tip: `age` minimum is 5 and `weight` minimum is 10 kg — values below these are
> flagged for you to double-check.

---

## 8. Managing fighters

- **Fighters** shows the whole roster with each fighter’s tatami and category.
- Click a fighter to **edit** belt, age, weight, school, etc. (belts and weights
  change — keep them current before grouping).

---

## 9. Auto-grouping into categories

On the **Categories** page:

1. Press **🤖 Auto-group**. The engine proposes divisions (single gender, single
   age band, tight weight spread, min 3 fighters per group).
2. Options before applying:
   - **Replace existing** — clear current categories first.
   - **Auto-assign tatami** — spread groups across your mats.
   - **Generate brackets now** — build every bracket immediately.
3. Press **Apply**.

Groups are ordered **youngest first** on each tatami, so the little kids fight
early and the older divisions later.

### Unassigned fighters
Fighters who can’t form a group of 3+ appear in **👤 Unassigned**, each with a
**reason** (e.g. *only 2 in this age band*, *weight isolated*). From there you can:
- **Add to a group** — the dropdown shows each group’s current size and lists only
  **gender-appropriate** groups (F fighters see female/open groups only). Mixed
  F-vs-M is allowed only in special bouts.
- **Create a special bout** — tick 2+ fighters and make an exhibition/hand-picked
  match (these can reuse any fighter).

> **No duplicate fights:** a fighter can be in only **one** regular group. To move
> someone to a different group, remove them from the current one first. Special
> bouts are the exception.

---

## 10. Editing a category

Click **Manage** on any group:

- **Criteria** — gender, age min/max, weight min/max, and the **bout time** for
  this group.
- **+ Fill matching fighters** — pulls in every *unassigned* fighter that matches
  the criteria.
- **Members** — reorder with ↑ ↓ (this is the seeding), remove with ✕.
- **First-round bouts** — a live preview showing **who fights whom** (AO in blue vs
  AKA in red), updating as you reorder.
- **Add fighter** — search the roster or **+ New fighter** to create one on the
  spot. Fighters already in another group are flagged.
- **Generate bracket** — builds the bracket and opens it.

### Seeding modes (on the Categories row)
- **By rank** — most senior seeded first.
- **By age** — youngest first.
- **By weight** — lightest first.
- **Random** or **Manual** (use the members order).

---

## 11. Running order on a tatami

On the Categories page each group on a mat shows a **#1, #2, …** badge — the order
the divisions run on that tatami.

---

## 12. Running the fights (brackets)

Open a bracket (**Open bracket**, or it opens after you generate it).

- **One fight at a time.** The **current** bout is highlighted with a green **NOW**
  ring and shows the timer. Every other ready bout is greyed with a **Waiting**
  badge. Semifinal/Bronze/Final show **Awaiting fighters** until their fighters are
  known.
- **Pick the winner** — tap the winning fighter’s box. A dialog asks **how they
  won**: enter the score and choose **Ippon / Waza-ari / Hantei / Shikkaku /
  Kiken**.
- **Result is locked** after that. The card shows the result (🏆 decision + score).
  To change it, press **🔒 Revert to change result**, then pick again.
- **Late fighter?** On the current bout press **⏭ Postpone** to send it to the back
  of the queue (the next bout becomes current). Bring it back anytime with
  **▶ Fight now** on that bout.
- **Bronze & final** — the two semifinal losers drop into the bronze match, which
  runs **before** the final. Placements (1–4) fill in automatically.

---

## 13. Timers

- **Bout timer** — on the current fight’s card. Pick the duration (e.g. 1:30, 2:00)
  and press ▶. At zero it **sounds an alarm**, the card flashes, and a big
  **⏱ TIME!** popup appears in the centre of the tatami screen (tap to dismiss).
- **Break timer** — a tatami-wide **☕ Break** countdown above the bracket, capped
  at **5 minutes**, for the pause before the next fight. It has its own alarm.

---

## 14. Podium & announcements

- When a bracket is finished, a **podium** (🥇🥈🥉) appears.
- Press **🏆 Announce podium** to show the winners **full-screen on every projector**
  at once.

---

## 15. Projector & print

- **Projector** (sidebar → *Projector ↗*, or `/projector`) — a public, full-screen,
  auto-updating view. Open `/projector/<tatamiId>` for a single mat. No login
  needed; put it on the hall screen.
- **Print** — open a bracket and use **🖨 Print** for a printable sheet.

---

## 16. Export & reset

- **Configuration → Reset** lets you clear event data (keeping ranks/users) or do a
  full reset. You’re asked to type the event name to confirm, and can download an
  archive first.

---

## 17. Language & layout

- Switch **English / Русский / עברית** at the bottom of the sidebar. Hebrew flips
  the whole layout to right-to-left automatically.

---

## 18. Moving to another computer

The app is portable — the database and uploads live in the folder:

1. Copy the whole project folder (includes `data\karate.sqlite` and `uploads\`).
2. On the new machine (Node 20+): `npm install` then `npm run build`.
3. `npm run serve`.

---

## 19. Publishing to Git

Run **`publish-to-github.bat`** (or `publish-to-github.ps1`). It creates a
**private** repository and pushes, after verifying that your `.env` secrets and
local data are never committed. Without the GitHub CLI, create an empty private
repo yourself and pass its URL:

```powershell
.\publish-to-github.ps1 -RemoteUrl https://github.com/<you>/karate-tournament.git
```

---

## 20. Troubleshooting

| Problem | Fix |
|---|---|
| **Port 80 fails on `npm run serve`** | Run the terminal as Administrator, or set `PORT` in `server\.env` and use `npm run build && npm --workspace server start -- 4000`. |
| **Can’t reach it from another device** | Both devices must be on the same network; use the host PC’s IP (`ipconfig`), and allow Node through the firewall. |
| **“Unknown rank” on import** | Use the exact belt names from the template’s *Ranks* sheet, or add an alias under Configuration → Ranks. |
| **Generate bracket does nothing** | A bracket needs at least 2 fighters in the group. |
| **A fighter won’t add to a group** | They’re already in another regular group (no duplicate fights) or the group is a different gender — remove them first or use a special bout. |
| **Forgot the admin password** | Re-run `npm run seed` to recreate the default admin (existing data is kept), and note the printed credentials. |
| **Prisma “EPERM / file locked”** | Stop the running app before `prisma generate` / `prisma db push`. |

---

© 2026 Victor Prusakov. Licensed under the terms in [LICENSE](LICENSE).
