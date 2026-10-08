# Baseline

An overnight recovery tracker for Apple Watch data exported with **Health Auto Export**. It tracks HRV, resting heart rate, respiratory rate and wrist temperature, plus training load, tags and ectopy. Each metric is judged against your own rolling baselines.

It runs entirely in the browser as an installable PWA, with no server and no account. Data lives on the device and, optionally, syncs to a JSON file per user in this repo.

**Live app:** https://altroad.github.io/HRV-Tracker/

---

## The screen

| # | Panel | What it shows |
|---|---|---|
| 1 | **Baselines strip** | Current baselines: HRV · RHR · RR · TEMP · KCAL |
| 2 | **Top card** | Latest / 3D avg / 7D avg / Trend, with the zones underneath. It auto-rotates HRV → RHR → RR → Kcal → Temp every 5 s; tap to flip manually (auto-rotation stops for the session). |
| 3 | **Status** | A combined verdict from the latest night, with HRV · RHR · RR · Temp columns. Tap it for the Status Reference. |
| 4 | **Today panel** | The night's HRV · RHR · RR · TEMP, the sleep-stage strip and stats, and the readings used. Below a divider is the previous day's activity: kcal (tap to edit), Quick Add **+** and tags. |
| 5 | **Capture Window** | Auto or manual shift of the overnight windows (below) |
| 6 | **Chart** | 14D / 60D trend of HRV, RHR, RR, Temp and Kcal |
| 7 | **Year at a Glance** | Heatmap: HRV, RHR, Kcal, Temp or Ect |
| 8 | **Data Analysis** | Every entry, with averages, sorting, note search and tag filters |

---

## Getting data in

### Automatic (recommended)
An iOS Shortcut uploads the morning's Health Auto Export JSON to the inbox, either `data/inbox-<user>.json` or a timestamped file in `data/inbox-<user>/`. When the app opens it:

1. reads the upload and clears it straight away, so an unanswered prompt can't leave it to re-import,
2. runs the Overnight Capture,
3. saves and syncs.

Each reading is dated from the data itself, not from when the app was opened.

### Manual
Copy the export and tap **IMPORT**, or paste it via **≡ → Overnight Capture**. If that date already has a reading, you're asked to **REPLACE** or **KEEP** it.

### Exports used
| Export | Required | Used for |
|---|---|---|
| HRV (yesterday + this morning) | ✓ | HRV capture |
| Sleep analysis | ✓ | Sleep stages, timeline, RR matching |
| Heart rate | | RHR |
| Respiratory rate | | RR |
| Sleeping wrist temperature | | Temp |
| Workouts | | Kcal (previous day) |

**Respiratory-rate history:** an upload containing respiratory rate and sleep analysis but **no HRV**, e.g. a few weeks exported in one go, only backfills RR for every night in it. HRV entries are left untouched.

---

## How each metric is measured

### HRV: Overnight Capture
1. **Deep sleep anchor.** Deep-sleep HRV readings are grouped into unbroken runs (Apple Watch samples about every 15 min; a gap over 20 min starts a new run). The middle 3 readings of the longest run form the anchor.
2. **Top-up to 7.** Remaining Deep readings are added first, then Core-sleep readings inside the capture window (11:30pm–2:00am by default).
3. **Trimmed mean.** The highest and lowest are dropped and the rest averaged. With 2 readings it's a plain average; 1 reading is used as is.

Chips show the readings used: dark blue = deep, cyan = core, dark red = trimmed. Readings recorded back to back share one bordered block.

### Capture window
A late night pushes sleep later, so the Core top-up and RHR windows can shift by up to 1 hour.
- **Auto:** shifts by how much later than 11:30pm the first deep cycle began, rounded to 5 min.
- **Manual:** a 0–60 min slider.

The deep anchor always follows actual deep sleep.

### Resting heart rate (RHR)
The lowest stretch of heart rate lasting at least 9 minutes (gaps up to 7 min bridged), between midnight and 3:30am, shifted by the capture window.

### Respiratory rate (RR)
The plain average of every Apple Watch respiratory-rate sample taken during **Core, Deep or REM** sleep in the night's main sleep session. Awake, "In Bed" and daytime samples are excluded, and at least 5 samples are needed. This matches AutoSleep's nightly figure.

### Wrist temperature
Apple Watch's sleeping wrist temperature, taken from the export.

### Calories
An entry's kcal is the **previous day's** activity, the session that shaped that morning's numbers. If Strava and Garmin record the same ride, it's counted once (Strava preferred). Extra activity can be added with Quick Add **+** or **≡ → Log Reading**.

---

## Baselines & zones

| Metric | Baseline | Zones |
|---|---|---|
| **HRV** | Average of the last 12 months (all data until then) | High ≥ 110% · Good 95–110% · OK 80–95% · Low < 80% |
| **RHR** | Average of the last 90 logged nights | Excellent ≤ +1 · Good +2–4 · Elevated +5–7 · High ≥ +8 bpm |
| **RR** | Average of the 30 nights before each night (needs 7) | Low ≤ −1 *(informational)* · Normal −1 to +1 · Elevated +1–2 · High ≥ +2 breaths/min |
| **Temp** | Manual start, then the median of the last 14 nights after 7 | Low < −0.5° · Normal ±0.5° · High > +0.5° |
| **Kcal** | 42-day average | Low / Medium / High / Extreme relative to it |

Starting baselines for **Temp** and **RR** can be set in **≡ → Set Baselines**. A manual value applies until 7 nights have been logged after it, then the rolling baseline takes over.

A **low RR** isn't a warning. A lower sleeping rate usually means deeper, calmer sleep or improving fitness, and it's normal for a while after returning from altitude.

---

## Status & alarms

The status message combines the latest **HRV zone × RHR zone** (16 messages) and adds notes for a raised temperature, an elevated or high RR, or a low RR. Four **warning signals** escalate it:

> HRV Low · RHR High · Temp > +0.5° · RR +1 or more

| Signals | Result |
|---|---|
| Temp + RR up while HRV and RHR hold | **Early illness signal** (amber) |
| Any 3 of the 4 | **Triple-system alarm** (red), naming the three |
| All 4 | **Quadruple-system alarm** (red) |

Tap the status bar for every combination.

---

## Tags & ectopy

Tap a tag pill (or **TAG**) to open the picker. Lit options are active; tap to toggle. Days without an HRV reading (e.g. travel days logged with only RHR or kcal) can be tagged too; the tags move onto the HRV reading if one is logged for that day later.
- **Training load** (one at a time): Rest, Active Recovery, <100TSS, 100-200TSS, 200-300TSS, 300TSS+, Race
- **Sick · Sauna · Cold**: independent toggles
- **Ectopy (PACs)**, one grade, logged on the morning entry for the previous day's ride:
  - **ECT 0:** none
  - **ECT 1:** felt in 120–140 bpm transitions only
  - **ECT 2:** sustained HR excess at steady sub-LT1 power
  - **ECT 3:** session-breaking

  A logged ECT 0 is kept separate from a day that wasn't logged.

---

## Chart, heatmap & analysis

- **14D chart:** each night's HRV dot has an inner ring for **RR** (green normal, red elevated, grey while the baseline builds) and an outer ring for **temperature** zone. The bold line is the rolling average (green above baseline, red below), the dotted line is RHR, and the strip along the bottom is kcal. Tap a dot for that night's numbers.
- **60D chart:** a cleaner trend view without rings.
- **Year at a Glance:** HRV / RHR / Kcal / Temp / Ect heatmap.
- **Data Analysis:** every day with any data (including kcal-only days) showing HRV · RHR · RR · Temp · Kcal, period averages, sorting, note search and tag filters. Tap a note to edit it; swipe left to delete.

---

## Sync, backup & updates

- **GitHub sync** (set via ⟳): each user's data is stored in `data/<user>.json`. The token is kept in the browser only.
- **Merging:** there's one reading per date. If an entry changed in two places, this device's version wins. Entries deleted or replaced on a device are remembered, so a sync can't bring them back.
- **Saving:** saves run one at a time. Changes made during an upload go up together in one follow-up save, and a dropped connection gets one quiet retry.
- **CSV backup:** **≡ → Export CSV** saves `Baseline_Backup.csv` with the columns `date, hrv, rhr, temp, note, tag, activities, ectopy, rr, kcal`. `activities` holds Sick/Sauna/Cold, and `kcal` holds the previous day's items as `Name=kcal;Name=kcal`. **Import CSV** restores it (adding only what's missing).
- **Updates:** the footer shows the app version (tap it to check). A newer version shows an **UPDATE READY** button.

---

## Files

| File | Purpose |
|---|---|
| `index.html` | The whole app: HTML, CSS and JS in one file |
| `sw.js` | Service worker: network-first HTML, cached fonts, icons and Chart.js |
| `manifest.json` | PWA manifest |
| `fonts/` | Self-hosted fonts |
| `data/<user>.json` | Synced data per user |
| `data/inbox-<user>…` | Shortcut uploads waiting to be imported |

## Tech stack

- Vanilla HTML/CSS/JS: no framework, no build step
- Chart.js 4 (cdnjs) for the trend chart
- Health Auto Export (iOS) and an iOS Shortcut for data
- GitHub Pages for hosting; the GitHub Contents API for sync
