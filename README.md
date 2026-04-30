# HRV Tracker

A personal HRV tracking web app built for Apple Watch data exported via Health Auto Export. Runs entirely in the browser — no server, no account. Data stored in `localStorage` with optional GitHub sync.

**Live app:** https://altroad.github.io/HRV-Tracker/

---

## Importing Data

### Slow Wave Sync (primary method)
Paste three Health Auto Export JSON exports together — previous day HRV, morning HRV, and sleep analysis. The app matches each HRV reading against Apple Watch sleep stage segments in priority order:

**Priority 1 — Deep Sleep HRV**
HRV readings whose timestamp falls inside a Deep (slow wave) sleep segment. Collected first, any time of night.

**Priority 2 — Core Sleep HRV · 11:30pm – 2:00am**
HRV readings during Core sleep within the early overnight window. Added until a combined total of 6 readings is reached.

Once 6 readings are collected, the trimmed mean is applied — highest and lowest are dropped, the remaining 4 are averaged. Result chips are colour-coded:
- Dark blue = Deep sleep reading
- Cyan = Core sleep reading
- Dark red = Deep reading dropped (highest or lowest)
- Light red = Core reading dropped (highest or lowest)

### Manual Sync (back-filling historical data)
Paste one day's HRV export, two consecutive days', or a full monthly export. A date & window picker appears so you choose which night and capture window to score:

- **Mid Sleep · 1:30am – 3:00am** — core deep-sleep window, most stable HRV signal
- **Early Sleep · 11:30pm – 1:29am** — first sleep cycle; only enabled when prior-night data (23:30+ readings) is present in the export
- **Both windows** — pools all readings from 11:30pm – 3:00am into one combined score

The *Another Date* button re-opens the picker reusing the same pasted data without re-pasting. Session-only — nothing extra is stored.

---

## Calculation

1. Collect readings from the selected window
2. Sort values lowest → highest
3. Drop the single highest and single lowest reading (trimmed mean)
4. Average the remaining values
5. Round to nearest whole number

With 2 readings a plain average is used. With 1 reading it is used directly.

**Why trimmed mean?** Removes artefact spikes from movement, brief arousals, or Apple Watch signal noise — more robust than a plain average for small overnight samples.

---

## Baseline & Zones

The baseline is the rolling 12-month average of all stored scores. If fewer than 12 months of data exist, all stored scores are used. Shown as a prominent badge beneath the app title.

Zone thresholds scale dynamically relative to the baseline:

| Zone | Threshold |
|------|-----------|
| High | ≥ baseline + 10% |
| Good | baseline − 5% to High − 1 |
| OK   | baseline − 20% to Good − 1 |
| Low  | < baseline − 20% |

---

## Data & Privacy

- All data stored in browser `localStorage` — nothing leaves the device unless GitHub sync is configured
- JSON exports are processed in-memory only and never persisted
- Optional GitHub sync stores a single JSON file in a private or public repo of your choice

---

## Tech Stack

- Vanilla HTML/CSS/JS — no framework, no build step
- Chart.js for the HRV trend chart
- Health Auto Export (iOS) for JSON data
- GitHub Pages for hosting
