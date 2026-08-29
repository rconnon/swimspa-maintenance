# Vita Spa XL4 Water Manager

A single-file, offline-capable web app for maintaining a **Vita Spa XL4**
swim spa (1,550 gal / 5,867 L, chlorine sanitizer + ozone).

**Launch it:** https://rconnon.github.io/swimspa-maintenance/ — works on
desktop and mobile browsers; add it to your phone's home screen for
one-tap access. All data stays on the device in `localStorage`; no
account, no server, no internet required after first load. You can also
open `index.html` directly as a file.

## What it does

> **TEST → DIAGNOSE → CORRECT ONE THING → CIRCULATE → RETEST**

- **Today dashboard** — is the water okay right now, six chemistry cards
  (FC, TC, pH, TA, hardness, CYA), current mode/temperature, and the
  single most important next action.
- **Guided EasyTest 7-in-1 workflow** — 1-second immersion, 15-second
  horizontal hold, no-typing tile entry with "between two colors" range
  support. The CYA pad's native 30–50 bucket is stored as a range,
  never a fabricated midpoint.
- **Prioritized diagnosis** — free-chlorine safety first, alkalinity
  before pH, one correction at a time, combined-chlorine estimates from
  total − free, and no dose ever computed without configured label data.
- **CYA as a first-class metric** — zones (preferred / caution / high),
  longitudinal tracking, and a dynamic water-change recommendation that
  reacts to CYA, age, and water condition — not just the calendar.
  Stabilized chlorine accumulates CYA; that's why this spa is drained
  every 3–4 months.
- **Seasonal modes** — Summer Swim/Play (85°F) and Fall/Winter Soak
  (102°F); mode and temperature ride every test and session so trends
  can compare seasons. Ozone is tracked but never excuses a missing
  chlorine residual.
- **Session logging** — 1–7+ bathers, session type, duration; high-load
  play dates tighten sanitizer freshness without condemning the normal
  strategy on one post-play low reading.
- **Fresh-fill wizard** — refill → untreated-water test → alkalinity →
  pH → hardness → chlorine → CYA baseline → final verification,
  resumable at the exact step.
- **History & trends** — timeline with refill dividers; seven time-scaled
  charts (including the derived combined-chlorine estimate) with target
  bands, CYA zone shading, event overlays, cycle summaries and
  deterministic pattern detection.
- **Backup** — full JSON export/import of all raw history.

## Development

Everything lives in `index.html` (vanilla HTML/CSS/JS, heavily
commented, no build step). The chemistry engine is pure and DOM-free so
the Node harness can exercise it directly:

```sh
node tests/run-tests.mjs
```

The tests implement the acceptance scenarios from `SPEC-XL4.md` (A–J)
plus the core rules. CI runs them on every PR.

Sibling project: [hottub-maintenance](https://github.com/rconnon/hottub-maintenance)
(same architecture, bromine hot tub).
