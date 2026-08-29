# Vita Spa XL4 Water Manager
## Codex Implementation Specification (`SPEC-XL4.md`)

### 1. Product Goal

Build a **single-file, self-contained HTML application** that helps maintain a Vita Spa XL4 swim spa safely and consistently.

The app should answer:

1. **Is the water okay right now?**
2. **What should I do next?**
3. **How is the water trending over time?**
4. **When should I shock, clean filters, or drain/refill?**
5. **Is cyanuric acid (CYA) getting high enough that a refill is preferable to more stabilized chlorine?**

Operating philosophy:

> **TEST → DIAGNOSE → CORRECT ONE THING → CIRCULATE → RETEST**

The app should help minimize unnecessary chemical use, preserve water quality, and make the chemistry understandable.

---

# 2. Spa Profile

Preload:

```javascript
const SPA_PROFILE = {
  name: "Vita Spa XL4",
  manufacturer: "Vita Spa",
  model: "XL4",
  volumeGallons: 1550,
  volumeLitres: 5867,
  sanitizerSystem: "chlorine",
  ozoneSystem: true,
  fillWater: "municipal",
  regularBathers: 3,
  maximumTypicalBathers: 7,
  typicalUsePerWeek: "2-3 sessions",
  waterChangeIntervalDays: 105
};
```

The refill interval defaults to approximately **3.5 months / 105 days**, but should be dynamically affected by CYA and water condition.

---

# 3. Seasonal Operating Modes

The app must support two first-class operating modes.

## Summer Swim / Play Mode

```javascript
{
  id: "summer_swim",
  label: "Summer Swim / Play",
  defaultTemperatureF: 85,
  defaultTemperatureC: 29.4,
  typicalActivity: "active swimming and kids playing"
}
```

Typical use:
- Regular family session: 3 bathers
- Occasional play date: up to 7 kids
- More physical activity
- Lower water temperature

## Fall / Winter Soak Mode

```javascript
{
  id: "hot_soak",
  label: "Fall / Winter Soak",
  defaultTemperatureF: 102,
  defaultTemperatureC: 38.9,
  typicalActivity: "soaking"
}
```

The app should log operating mode and water temperature with tests and soak events.

Do not assume chemistry demand is identical between modes.

---

# 4. Technical Requirements

Deliver as:

> `index.html`

Requirements:
- Single HTML file
- No server
- No account/login
- Vanilla HTML/CSS/JS preferred
- Fully offline
- No external libraries/CDNs/fonts/APIs
- Mobile-first
- Persistent localStorage
- Import/export JSON
- Responsive on phone/tablet/desktop
- No build process
- Readable, commented source

---

# 5. Navigation

Bottom navigation:

1. **Today**
2. **Test Water**
3. **Maintenance**
4. **History**
5. **Settings**

History should contain:
- Timeline
- Trends

Default launch:
> Today

If fresh-fill setup is active, resume it automatically.

---

# 6. Test Kit

User uses:

> **EasyTest 7-in-1 Pool & Spa Test Strips**

Instructions:

1. Immerse strip for approximately **1 second**
2. Remove
3. **Do not shake excess water off**
4. Hold horizontally for **15 seconds**
5. Compare immediately in natural light

Relevant parameters:

```javascript
const EASYTEST_KIT = {
  id: "easytest_7in1",
  name: "EasyTest 7-in-1 Pool & Spa Test Strips",
  immersionSeconds: 1,
  readDelaySeconds: 15,

  parameters: {
    hardness: {
      label: "Total Hardness",
      unit: "ppm",
      values: [0, 100, 250, 500, 1000]
    },

    freeChlorine: {
      label: "Free Chlorine",
      unit: "ppm",
      values: [0, 0.5, 1, 3, 5, 10]
    },

    totalChlorine: {
      label: "Total Chlorine",
      unit: "ppm",
      values: [0, 0.5, 1, 3, 5, 10]
    },

    cya: {
      label: "Cyanuric Acid",
      unit: "ppm",
      values: [0, "30-50", 100, 150, 240]
    },

    alkalinity: {
      label: "Total Alkalinity",
      unit: "ppm",
      values: [0, 40, 80, 120, 180, 240]
    },

    pH: {
      label: "pH",
      values: [6.2, 6.8, 7.2, 7.8, 8.4, 9.0]
    }
  },

  hiddenParameters: ["bromine"]
};
```

---

# 7. Chemistry Targets

Make configurable defaults.

```javascript
const SPA_TARGETS = {
  freeChlorine: {
    min: 3,
    max: 5
  },

  pH: {
    min: 7.2,
    idealMin: 7.4,
    idealMax: 7.6,
    max: 7.8
  },

  alkalinity: {
    min: 80,
    max: 120
  },

  hardness: {
    min: 150,
    max: 250
  },

  cya: {
    preferredMin: 20,
    preferredMax: 50,
    caution: 100,
    high: 150
  }
};
```

Important:
- CYA logic must be editable
- Do not pretend the EasyTest kit has precision it does not have
- If test says `30–50`, store it as a range

---

# 8. Free vs Total Chlorine

Track both independently.

Calculate approximate combined chlorine:

```javascript
combinedChlorine =
  Math.max(0, totalChlorine - freeChlorine);
```

Label this as:

> **Estimated combined chlorine**

because strip resolution is coarse.

Do not overstate precision.

If combined chlorine appears elevated repeatedly, surface shock/oxidation guidance and water-condition context.

---

# 9. Ozone Logic

The XL4 has an ozone system.

The app should recognize:

- Ozone can reduce chlorine demand
- Ozone does **not** replace maintaining a measurable free chlorine residual
- Low chlorine is not acceptable simply because ozone is installed
- Chlorine trends should account for the presence of ozone, but never excuse a zero residual

Add setting:

```javascript
ozoneSystem: {
  installed: true,
  enabled: true
}
```

---

# 10. Today Dashboard

Top status:

### GREEN
**Water looks good**

### AMBER
**Water needs attention**

### RED
**Do not use yet**

### GRAY
**Test water first**

Show chemistry cards for:
- Free Chlorine
- Total Chlorine
- pH
- Total Alkalinity
- Total Hardness
- CYA

Also show:
- Current mode
- Water temperature
- Water age
- Shock status
- Filter status
- Last test time

---

# 11. Main Actions

Primary buttons:
- **TEST WATER**
- **CAN WE USE IT?**
- **WE USED THE SWIM SPA**
- **FRESH FILL / WATER CHANGE**

---

# 12. Test Water Workflow

Offer:

## Quick Check
- Free Chlorine
- pH

## Full Test
- Hardness
- Free Chlorine
- Total Chlorine
- CYA
- Alkalinity
- pH

## Fresh Fill Test
Automatically enters startup flow.

---

# 13. Exact EasyTest Workflow

Screen:

> Grab one EasyTest strip.

Then:

> Immerse for 1 second and remove.

Button:

> **I DIPPED IT**

Then:

```text
HOLD STRIP HORIZONTALLY

00:15

Do not shake excess water off.
```

After timer:

> **MATCH YOUR STRIP NOW**

No numeric typing required.

Use selectable discrete values from the bottle.

---

# 14. Between-Color Support

Every parameter should allow:

> **Looks between two colors**

Store ranges instead of invented midpoints.

Example:

```javascript
{
  lower: 3,
  upper: 5,
  approximate: true
}
```

For CYA:

```javascript
{
  lower: 30,
  upper: 50,
  approximate: true
}
```

Do not silently convert `30–50` to 40.

---

# 15. Test Record Structure

Every test must include:
- Exact date
- Exact local time
- Year
- Test type
- Test context
- Operating mode
- Water temperature
- Test kit
- Water-cycle ID
- All measured values

Example:

```javascript
{
  id: "test_...",
  timestamp: "2026-08-29T10:57:00-07:00",
  localDate: "2026-08-29",
  localTime: "10:57",
  year: 2026,
  testType: "full",
  context: "normal",
  operatingMode: "summer_swim",
  waterTemperatureF: 85,
  testKit: "easytest_7in1",
  waterCycleId: "cycle_2026_08_29",
  values: {
    freeChlorine: 3,
    totalChlorine: 3,
    pH: 7.2,
    alkalinity: 80,
    hardness: 250,
    cya: { lower: 30, upper: 50, approximate: true }
  }
}
```

---

# 16. Diagnostic Priority

Order:

1. Free chlorine safety
2. Total alkalinity
3. pH
4. Hardness
5. Combined chlorine / shock need
6. CYA
7. Maintenance

Recommend one main chemistry correction at a time where practical.

---

# 17. Chlorine Logic

Suggested interpretation:

## 0 ppm
Red:
> Free chlorine is depleted. Do not use.

## 0.5–1 ppm
Red/Amber:
> Free chlorine is too low.

## 3–5 ppm
Green:
> Normal operating range.

## 10 ppm
Red/Amber:
> Chlorine is high. Do not add more sanitizer. Retest before use.

Because strip values are discrete, do not invent 2.4 or 4.1 ppm.

---

# 18. Combined Chlorine Logic

Estimate:

```javascript
combined = total - free
```

If estimated combined chlorine is meaningfully above zero on repeated full tests:

> Combined chlorine may be building up.

Check:
- Recent heavy bather load
- Shock status
- Water age
- Filter condition

Do not overreact to one coarse strip result.

---

# 19. CYA Logic

CYA is a major part of this app.

Because stabilized chlorine is being used, CYA should be tracked longitudinally.

Interpret roughly:

## 0
> No/very low stabilizer detected.

## 30–50
> Good working range.

## 100
> Elevated. Watch chlorine effectiveness and plan water management.

## 150
> High. Refill/dilution should become a strong consideration.

## 240
> Very high. Water replacement is likely preferable to continuing stabilized chlorine additions.

Do not hardcode a single universal drain threshold; allow settings.

The app should emphasize that **CYA accumulation is one of the main reasons this spa is drained every 3–4 months**.

---

# 20. Dynamic Water-Change Logic

Default refill interval:

> 90–120 days

Nominal target:
> 105 days

But use CYA and water condition to modify recommendation.

Example:

### Water age 70 days + CYA 30–50
> Continue normal maintenance.

### Water age 80 days + CYA 100
> Start planning a water change.

### CYA 150+
> Strong refill/dilution recommendation even if water is younger.

### CYA 240
> Water change strongly recommended.

Also consider:
- Persistent cloudiness
- Repeated chlorine instability
- Persistent foam
- Frequent correction needs
- High combined chlorine estimate

---

# 21. Fresh Fill Wizard

Required sequence:

1. Drain/refill
2. Circulation
3. Test untreated city water
4. Correct alkalinity
5. Correct pH
6. Check hardness
7. Establish chlorine
8. Establish/record initial CYA
9. Final verification
10. Begin new water cycle

---

# 22. Fresh Fill State Machine

```javascript
const STARTUP_STATES = [
  "refill",
  "initial_test",
  "alkalinity",
  "ph",
  "hardness",
  "chlorine",
  "cya_baseline",
  "final_test",
  "complete"
];
```

Persist state.

---

# 23. Fresh Fill — Initial Test

Run full EasyTest workflow before chemicals.

Record:
- Hardness
- FC
- TC
- CYA
- TA
- pH

Context:
> `fresh_fill`

Do not show all corrections at once.

---

# 24. Fresh Fill — Alkalinity First

Target:

> 80–120 ppm

If low:
> Use configured alkalinity increaser.

If high:
> Follow configured lowering procedure gradually.

Retest before advancing.

Explain:

> Alkalinity helps stabilize pH.

---

# 25. Fresh Fill — pH

Only after alkalinity is acceptable.

Target:

> 7.2–7.8

If in range:
> No pH adjustment required.

If not:
Use configured pH up/down product.

Retest before advancing.

---

# 26. Fresh Fill — Hardness

Target:
> approximately 150–250 ppm

Interpret strip limitations:
- 100 → low
- 250 → acceptable
- 500+ → high

Do not invent 180 ppm from a 250 strip result.

---

# 27. Fresh Fill — Chlorine

Use the configured routine sanitizer product.

Target:
> 3–5 ppm free chlorine

Require retest before setup is complete.

Ozone should be running if normally enabled.

---

# 28. Fresh Fill — CYA Baseline

Record fresh-fill CYA.

If using stabilized chlorine:
> CYA may begin low and rise over the water cycle.

This baseline is important for longitudinal analysis.

---

# 29. Chemical Inventory

Preload:

## Piper Clear Alk+ Buffer
Role:
> Alkalinity increaser

## Piper Clear pH Down
Role:
> Lowers pH

## Aqua Granular
Role:
> Stabilized chlorine sanitizer

## Piper Clear Cal
Role:
> Calcium hardness increaser

## Aqua Shock
Role:
> Chlorinating shock / oxidation

## Aqua pH+ Plus
Role:
> Raises pH

Exact dose calculations must use label data.

---

# 30. Dosing Safety

Never hardcode dose amounts unless actual product label dosage is configured.

Generic scaling:

```text
requiredDose =
labelDose × spaVolume / labelReferenceVolume
```

Volume:
> 5,867 L / 1,550 US gallons

Always display:

> Follow the product label.

> Never premix concentrated chemicals.

> Add chemicals separately.

> Chemical handling is an adult task.

---

# 31. Swim-Spa Usage Logging

Button:

> **WE USED THE SWIM SPA**

Ask:

## Bathers
- 1
- 2
- 3
- 4
- 5
- 6
- 7+

Default:
> 3

## Session type
- Active swimming
- Kids playing
- Soaking
- Mixed use

## Duration
- <15 min
- 15–30
- 30–60
- 60+ min

## Water temperature
Default from current mode.

---

# 32. Bather-Load Classification

Examples:

### 1–3 bathers
Normal family load

### 4–5 bathers
Moderate/high load

### 6–7+ bathers
High load

A 7-kid play session should:
- Log high bather load
- Recommend checking FC after use
- Surface shock status
- Reduce acceptable age of sanitizer reading
- Watch next 12–24h test for chlorine drop
- Avoid declaring the normal sanitizer strategy inadequate based on one post-play low reading

---

# 33. Seasonal Context

Trend engine must track:
- Summer Swim/Play
- Fall/Winter Soak
- Temperature

Pattern examples:

> Free chlorine drops faster after high-load summer play sessions.

> pH tends to rise more often during hot-soak operation.

Only surface after sufficient data.

---

# 34. Shock Tracker

Default cadence:
> Weekly

Also surface after:
- High bather load
- Elevated combined chlorine estimate
- Cloudiness with acceptable FC
- Strong odor/organic load

Do not automatically require shock after every normal use.

---

# 35. Filter Maintenance

Track:
- Filter rinse
- Deep filter clean
- Filter replacement

Make intervals configurable.

Suggested defaults:
- Rinse every 1–2 weeks
- Deep clean monthly
- Replacement per manufacturer/user setting

---

# 36. Water Appearance

Optional observations:
- Clear
- Slightly cloudy
- Cloudy
- Very cloudy

Foam:
- None
- Minor
- Persistent

Odor:
- Normal
- Strong chlorine-like smell
- Musty/unusual

Surface:
- Normal
- Slippery
- Scale visible

---

# 37. Cloudy Water Logic

If cloudy + FC low:
> Restore sanitizer first.

If cloudy + FC normal, check:
1. High bather load
2. Shock due
3. Filter condition
4. pH
5. Hardness
6. Water age
7. CYA

---

# 38. Trend System

Required V1 feature.

Every test must be graphable.

Charts:
- Free Chlorine
- Total Chlorine
- Estimated Combined Chlorine
- pH
- Total Alkalinity
- Total Hardness
- CYA

Do not combine incompatible raw units on one y-axis.

---

# 39. Trend Time Ranges

Provide:
- 7 days
- 30 days
- 90 days
- Current water cycle
- 1 year
- All

Default:
> Current water cycle

---

# 40. Target Bands

Show target bands:

## Free Chlorine
3–5 ppm

## pH
7.2–7.8

## TA
80–120 ppm

## Hardness
150–250 ppm

## CYA
Visually distinguish:
- preferred
- caution
- high

---

# 41. Event Overlays

Optional markers for:
- Soaks/swims
- High-load play dates
- Shock
- Chemical additions
- Filter cleaning
- Refill
- Ozone enabled/disabled
- Seasonal mode switch

Default:
> Show events = On

---

# 42. Pattern Detection

Use deterministic rules.

Examples:

### Repeated low free chlorine
If 3 of last 5 normal-context readings are low:
> Free chlorine frequently runs low.

### Post-play chlorine drop
If FC is normal before a 6–7 bather play session and low within 24h repeatedly:
> Chlorine commonly drops after high-load play sessions.

### CYA accumulation
If CYA steps upward across a water cycle:
> CYA is accumulating during this water cycle.

### Seasonal difference
If enough data:
> Chlorine demand is higher during 102°F hot-soak operation.

### Late-cycle instability
If corrections increase after 60–90 days:
> Water is becoming harder to maintain late in the cycle.

---

# 43. Water-Cycle Segmentation

Each refill creates:

```javascript
waterCycleId = "cycle_YYYY_MM_DD";
```

Trend views:
- Current cycle
- Previous cycle
- All time

Each cycle summary:
- Start/end date
- Days
- Number of tests
- Number of sessions
- High-load sessions
- Shock count
- FC in-range %
- pH in-range %
- TA in-range %
- CYA start/end
- Most common imbalance

---

# 44. Trend Dashboard Summary

Example:

```text
CURRENT WATER CYCLE
Aug 29 – Present
73 days

Free chlorine in range    78%
pH in range               91%
Alkalinity in range       87%

CYA
Started: 0–30 ppm
Now: 100 ppm

Most common issue:
Low chlorine after high-load play
```

---

# 45. “Can We Use It?” Logic

Check:
- Free chlorine
- pH
- Test freshness
- Water clarity
- Recent chemical additions
- Active startup state

Return:

### YES
> Latest readings are within normal operating ranges.

### TEST FIRST
> Sanitizer reading is too old.

### NOT YET
> Free chlorine is below the normal range.

Ozone does not override the chlorine requirement.

---

# 46. Test Freshness

Suggested:

## Free chlorine / pH
If >3 days old:
> Quick check due

If recent high-load session:
> Require fresher sanitizer data

## Full chemistry
If >7 days old:
> Full test due

CYA should be tracked routinely because it drives refill timing.

---

# 47. Dashboard Example

```text
VITA SPA XL4
Summer Swim / Play · 85°F

Water looks good ✓

Free Chlorine
3 ppm
In range

Total Chlorine
3 ppm

pH
7.2
In range

Alkalinity
80 ppm
In range

Hardness
~250 ppm
In range

CYA
30–50 ppm
Good


CAN WE USE IT?
YES ✓


NEXT ACTION
Full test due in 2 days


WATER
67 / ~105 days

SHOCK
5 days ago

[ TEST WATER ]
[ WE USED THE SWIM SPA ]
```

---

# 48. Data Storage

Use:

```text
vitaSpaXL4WaterManager_v1
```

Structure:

```javascript
{
  version,
  spaProfile,
  operatingMode,
  ozone,
  testKit,
  targets,
  chemicalInventory,
  readings,
  events,
  waterCycles,
  startupState,
  maintenance,
  settings
}
```

---

# 49. Event Types

```text
water_test
chemical_added
shock
swim_session
filter_rinse
filter_clean
filter_replace
drain_started
refill
startup_complete
mode_change
ozone_change
note
```

---

# 50. Export / Import

Export JSON must preserve:
- Every test
- Exact timestamps
- Original strip values/ranges
- Test kit
- Context
- Temperature
- Operating mode
- Water-cycle ID
- Chemical additions
- Shock
- Sessions
- Filters
- Refills
- Ozone state

Charts must always be reconstructable from raw history.

---

# 51. Acceptance Tests

## A — Good summer water

```text
FC 3
TC 3
pH 7.2
TA 80
Hardness 250
CYA 30–50
Mode Summer
85°F
```

Expected:
> Water looks good.

## B — Low FC

FC:
> 1 ppm

Expected:
> Do not use yet.
> Restore chlorine.

## C — High pH + low TA

```text
FC 3
pH 8.4
TA 40
```

Expected:
> Correct alkalinity first.

## D — Elevated combined chlorine estimate

```text
FC 1
TC 3
```

Expected:
> Combined chlorine may be elevated.
> Evaluate sanitizer, shock status, and recent bather load.

## E — High CYA

CYA:
> 150 ppm

Expected:
> CYA is high.
> Strongly consider dilution/refill instead of continuing stabilized chlorine buildup.

## F — Very high CYA

CYA:
> 240 ppm

Expected:
> Water change strongly recommended.

## G — Play date

```text
7 bathers
Kids playing
60 min
85°F
```

Expected:
- High-load session logged
- Recommend checking FC
- Surface shock status

## H — Hot winter mode

Mode:
> Fall/Winter Soak

Temperature:
> 102°F

Expected:
- Store mode/temperature
- Trend engine can compare seasonal behavior

## I — Refill segmentation

Refill #1:
> Aug 29

Refill #2:
> Dec 10

Expected:
- Separate cycles
- Current-cycle graph starts Dec 10

## J — CYA trend

```text
Aug 29: 0
Sep 25: 30–50
Oct 25: 100
Nov 20: 150
```

Expected:
> Pattern detected: CYA is accumulating.
> Refill planning recommended.

---

# 52. Core Rules

1. **Test before treating**
2. **Correct one major chemistry issue at a time**
3. **Alkalinity before pH**
4. **Free chlorine safety overrides normal sequencing**
5. **Ozone never substitutes for a chlorine residual**
6. **Never invent strip precision**
7. **Never calculate doses without configured label data**
8. **Track CYA as a first-class metric**
9. **Use bather load and temperature as context**
10. **Fresh-fill setup should feel like following a recipe**
11. **Every test must be timestamped**
12. **Every chemistry metric must be trendable**
13. **Water-change logic should react to CYA, age, and water condition—not just a calendar**
14. **The dashboard must always identify the most important next action**

---

# 53. Definition of Done

V1 is complete when the user can:

1. Open one offline HTML file.
2. See whether the XL4 is ready to use.
3. Run the exact EasyTest 1-second dip + 15-second read workflow.
4. Enter strip results without typing.
5. Track FC, TC, combined chlorine estimate, pH, TA, hardness, and CYA.
6. Receive prioritized diagnostic guidance.
7. Be guided through a complete fresh-fill startup.
8. Track ozone status.
9. Switch between Summer Swim/Play and Fall/Winter Soak modes.
10. Log 1–7+ bathers and session type.
11. Recognize high-load kid play sessions.
12. Track shock.
13. Track filter maintenance.
14. Track 3–4 month water cycles.
15. Use CYA to influence refill recommendations.
16. See exact date/time/year for every test.
17. Graph every chemistry parameter over time.
18. Overlay swims, play dates, chemical additions, shock, filters, mode changes, and refills.
19. See deterministic pattern insights.
20. Compare current and previous water cycles.
21. Export/import all raw history.
22. Use the app entirely offline.
