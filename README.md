# HRV Tracker

Tracks overnight HRV values from Apple Watch data exported via Health Auto Export.

## Calculation Algorithm

Daily HRV scores are calculated using a trimmed mean from raw Apple Watch overnight readings.

**Data source:** Raw HRV samples exported from Apple Health via the Health Auto Export app (JSON format), triggered manually each morning via an Apple Shortcut.

**Time window:** Only readings between 1:30am and 3:00am are used — the core deep sleep window where HRV is most stable.

**Steps:**
1. Extract all readings within the 1:30–3am window
2. Sort by value
3. Drop the single highest and single lowest reading
4. Average the remaining values
5. Round to nearest whole number

**Minimum readings:** At least 3 readings are required in the window to calculate a score.

**Why trimmed mean?** Dropping the outliers removes artefact readings caused by movement, brief arousals, or Apple Watch signal noise. The trimmed mean is more robust than a simple average for small sample sizes with occasional corrupted readings.

**Supported formats:** Both Health Auto Export formats are accepted — entries with a `start` field and entries with only a `date` field.
