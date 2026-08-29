#!/usr/bin/env node
/**
 * Test harness for the Vita Spa XL4 Water Manager.
 *
 * The app ships as one self-contained index.html. Its chemistry /
 * diagnostic engine is written as pure top-level functions with no DOM
 * access at definition time, so we extract the <script> body, run it in
 * a Node vm with a localStorage stub, and exercise the engine directly
 * against SPEC-XL4.md's acceptance scenarios (§51) and core rules (§52).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(join(root, "index.html"), "utf8");
const match = html.match(/<script>([\s\S]*)<\/script>/);
if (!match) { console.error("FATAL: could not extract <script> from index.html"); process.exit(1); }

const storage = new Map();
const sandbox = {
  localStorage: {
    getItem: k => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: k => storage.delete(k)
  },
  console, navigator: {}, window: undefined
};
vm.createContext(sandbox);
vm.runInContext(match[1], sandbox, { filename: "index.html<script>" });

// Top-level const/function declarations live in the context's global
// environment; a follow-up eval in the same context sees them all.
const S = vm.runInContext(`({
  SPA_PROFILE, SPA_TARGETS, STARTUP_STATES, TEST_KITS, MODES,
  defaultState, loadState, saveState, addEvent, asInterval, rangeStatus,
  interpretFC, interpretTC, interpretPH, interpretAlkalinity, interpretHardness,
  interpretCYA, interpretParam, combinedChlorine, formatValue, waterTests,
  latestReading, paramFreshness, loadClass, isHeavySession, diagnose,
  canWeUseIt, overallStatus, waterAgeDays, currentCycleId, waterCycles,
  cycleSummary, trendDirection, detectPatterns, waterChangeAdvice,
  computeDose, findChemical, maintenanceStatus, cloudyWaterAdvice,
  startupInProgress, finalTestOutcome, tooltipHtml, freshFillBalanceStep,
  bucketInterval, chartPoints, doseLine, trendRangeTests, padSwatchHtml, testValuesHtml, PAD_COLORS, roundDose
})`, sandbox);

/* ---------------- tiny test runner ---------------- */
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok  " + name); }
  catch (e) { failed++; console.error("FAIL  " + name + "\n      " + e.message); }
}
function eq(actual, expected, label) {
  if (actual !== expected) throw new Error((label || "") + " expected " + JSON.stringify(expected) + ", got " + JSON.stringify(actual));
}
function ok(cond, label) { if (!cond) throw new Error(label || "condition was false"); }

const NOW = new Date("2026-08-29T12:00:00");
function val(v, approx) { return { value: v, approximate: !!approx }; }
function range(lo, hi) { return { lower: lo, upper: hi, approximate: true }; }
function freshState() { return S.defaultState(); }
function addTest(state, whenIso, values, context, testType, mode) {
  return S.addEvent(state, "water_test",
    { testType: testType || "full", context: context || "normal", testKit: "easytest_7in1",
      precision: "discrete-strip", operatingMode: mode || state.operatingMode,
      waterTemperatureF: mode === "hot_soak" ? 102 : 85, values },
    "", whenIso);
}
const GOOD = () => ({ freeChlorine: val(3), totalChlorine: val(3), pH: val(7.2),
  alkalinity: val(80), hardness: val(250, true), cya: range(30, 50) });

console.log("\n== SPEC §51 acceptance scenarios ==");

test("A — good summer water: no actions, green, YES", () => {
  const actions = S.diagnose(GOOD(), S.SPA_TARGETS);
  eq(actions.length, 0, "actions");
  const st = freshState();
  addTest(st, "2026-08-29T09:00:00", GOOD(), "normal", "full", "summer_swim");
  eq(S.overallStatus(st, NOW).color, "green");
  eq(S.canWeUseIt(st, NOW).verdict, "YES");
});

test("B — FC 1 ppm: red, blocks use, restore chlorine", () => {
  const actions = S.diagnose({ freeChlorine: val(1) }, S.SPA_TARGETS);
  eq(actions[0].parameter, "freeChlorine");
  ok(actions[0].blocksUse, "blocks use");
  ok(/restore/i.test(actions[0].title), "says restore");
  const st = freshState();
  addTest(st, "2026-08-29T09:00:00", { freeChlorine: val(1), pH: val(7.2) });
  eq(S.overallStatus(st, NOW).color, "red", "Do not use yet");
  eq(S.canWeUseIt(st, NOW).verdict, "NOT_YET");
});

test("C — high pH + low TA: alkalinity first, pH suppressed", () => {
  const actions = S.diagnose({ freeChlorine: val(3), pH: val(8.4), alkalinity: val(40) }, S.SPA_TARGETS);
  eq(actions[0].parameter, "alkalinity", "first action");
  ok(actions[0].blocksPHAdjustment, "blocks pH adjustment");
  ok(!actions.some(a => a.parameter === "pH"), "no simultaneous pH correction");
});

test("D — FC 1 / TC 3: combined-chlorine note rides alongside blocking FC action", () => {
  eq(S.combinedChlorine(val(1), val(3)), 2, "estimate = 2");
  const actions = S.diagnose({ freeChlorine: val(1), totalChlorine: val(3) }, S.SPA_TARGETS);
  ok(actions[0].blocksUse && actions[0].parameter === "freeChlorine", "FC still blocks first");
  const cc = actions.find(a => a.parameter === "combined");
  ok(cc, "combined note present");
  ok(/elevated/i.test(cc.title), "flags possible elevation");
  ok(/bather load|shock/i.test(cc.message), "points at shock/bather-load evaluation");
});

test("E — CYA 150: high, strongly consider dilution/refill", () => {
  eq(S.interpretCYA(val(150), S.SPA_TARGETS).zone, "high");
  const actions = S.diagnose({ cya: val(150) }, S.SPA_TARGETS);
  const a = actions.find(x => x.parameter === "cya");
  ok(a && /dilution|refill/i.test(a.message), "recommends dilution/refill");
  ok(!a.blocksUse, "CYA never blocks same-day use");
  const st = freshState();
  st.maintenance.lastRefillDate = "2026-07-20T12:00:00"; // only 40 days old
  addTest(st, "2026-08-29T09:00:00", { cya: val(150) });
  const wc = S.waterChangeAdvice(st, NOW);
  eq(wc.level, "strong", "strong refill advice even for young water");
});

test("F — CYA 240: water change strongly recommended", () => {
  eq(S.interpretCYA(val(240), S.SPA_TARGETS).zone, "very_high");
  const st = freshState();
  st.maintenance.lastRefillDate = "2026-08-01T12:00:00";
  addTest(st, "2026-08-29T09:00:00", { cya: val(240) });
  const wc = S.waterChangeAdvice(st, NOW);
  eq(wc.level, "due");
  ok(/strongly recommended/i.test(wc.message));
});

test("G — 7-bather play date: high load, FC check + shock surfaced, freshness tightened", () => {
  const st = freshState();
  addTest(st, "2026-08-29T08:00:00", { freeChlorine: val(3), pH: val(7.2) }, "normal", "quick");
  eq(S.canWeUseIt(st, NOW).verdict, "YES", "fresh reading before session");
  const ev = S.addEvent(st, "swim_session", { bathers: 7, bathersLabel: "7+", sessionType: "Kids playing",
    duration: "60+ min", waterTemperatureF: 85, operatingMode: "summer_swim" }, "", "2026-08-29T10:00:00");
  eq(S.loadClass(ev), "high", "classified high load");
  ok(S.isHeavySession(ev));
  eq(S.canWeUseIt(st, NOW).verdict, "TEST_FIRST", "heavy session invalidates sanitizer reading");
});

test("H — hot-soak mode: mode + temperature stored on tests", () => {
  const st = freshState();
  st.operatingMode = "hot_soak";
  const ev = addTest(st, "2026-08-29T09:00:00", { freeChlorine: val(3) }, "normal", "quick", "hot_soak");
  eq(ev.data.operatingMode, "hot_soak");
  eq(ev.data.waterTemperatureF, 102);
});

test("I — refills segment water cycles; current cycle excludes older tests", () => {
  const st = freshState();
  addTest(st, "2026-06-01T09:00:00", { freeChlorine: val(3) });
  st.maintenance.lastRefillDate = "2026-08-29T08:00:00";
  S.addEvent(st, "refill", {}, "", "2026-08-29T08:00:00");
  addTest(st, "2026-08-29T09:00:00", { freeChlorine: val(3) });
  addTest(st, "2026-09-02T09:00:00", { freeChlorine: val(1) });
  const cycles = S.waterCycles(st);
  eq(cycles.length, 2, "two cycles");
  eq(cycles[1].events.filter(e => e.type === "water_test").length, 2, "current cycle has only post-refill tests");
});

test("J — CYA stepping up across the cycle: accumulation pattern + refill planning", () => {
  const st = freshState();
  st.maintenance.lastRefillDate = "2026-05-29T12:00:00";
  S.addEvent(st, "refill", {}, "", "2026-05-29T12:00:00");
  addTest(st, "2026-05-29T13:00:00", { cya: val(0) });
  addTest(st, "2026-06-25T09:00:00", { cya: range(30, 50) });
  addTest(st, "2026-07-25T09:00:00", { cya: val(100) });
  addTest(st, "2026-08-20T09:00:00", { cya: val(150) });
  const patterns = S.detectPatterns(st, NOW);
  const p = patterns.find(x => x.id === "cya_accumulating");
  ok(p, "pattern detected: CYA is accumulating");
  ok(/refill/i.test(p.suggestion), "refill planning recommended");
});

console.log("\n== Interpretation tables & strip precision ==");

test("FC strip table: 0 depleted · 0.5/1 too low (block) · 3–5 green · 10 high do-not-add", () => {
  const T = S.SPA_TARGETS;
  ok(S.interpretFC(val(0), T).blocksUse && S.interpretFC(val(0), T).label === "Depleted");
  ok(S.interpretFC(val(0.5), T).blocksUse);
  ok(S.interpretFC(val(1), T).blocksUse);
  eq(S.interpretFC(val(3), T).status, "green");
  eq(S.interpretFC(val(5), T).status, "green");
  const hi = S.interpretFC(val(10), T);
  ok(hi.blocksUse && hi.doNotAdd, "10 ppm blocks and forbids adding");
});

test("Ozone never excuses a missing residual: FC 0 blocks with ozone enabled", () => {
  const st = freshState();
  ok(st.ozone.installed && st.ozone.enabled, "ozone on by default");
  addTest(st, "2026-08-29T09:00:00", { freeChlorine: val(0), pH: val(7.2) });
  eq(S.canWeUseIt(st, NOW).verdict, "NOT_YET", "blocked despite ozone");
  eq(S.overallStatus(st, NOW).color, "red");
});

test("CYA zones: 0 none · 30–50 good · 100 caution · 150 high · 240 very high", () => {
  const T = S.SPA_TARGETS;
  eq(S.interpretCYA(val(0), T).zone, "none");
  eq(S.interpretCYA(range(30, 50), T).status, "green");
  eq(S.interpretCYA(val(100), T).zone, "caution");
  eq(S.interpretCYA(val(150), T).zone, "high");
  eq(S.interpretCYA(val(240), T).zone, "very_high");
});

test("CYA 30–50 bucket is stored as a range — never a fabricated midpoint", () => {
  // The kit definition itself carries the range bucket.
  const bucket = S.TEST_KITS.easytest_7in1.parameters.cya.values[1];
  eq(typeof bucket, "object", "bucket is a range object, not a number");
  const biv = S.bucketInterval(bucket);
  eq(biv.lo, 30); eq(biv.hi, 50);
  // Stored form survives round-trip with no .value invented.
  const st = freshState();
  addTest(st, "2026-08-29T09:00:00", { cya: range(30, 50) });
  const stored = st.events[0].data.values.cya;
  eq(stored.lower, 30); eq(stored.upper, 50); ok(stored.approximate);
  ok(stored.value === undefined, "no midpoint stored");
  eq(S.formatValue("cya", stored), "30–50 ppm");
});

test("Combined chlorine: never computed from approximate reads", () => {
  eq(S.combinedChlorine(val(3), val(5)), 2);
  eq(S.combinedChlorine(val(5), val(3)), 0, "clamped at zero");
  eq(S.combinedChlorine(range(1, 3), val(3)), null, "approximate FC → no estimate");
  eq(S.combinedChlorine(val(3), null), null);
});

test("Borderline FC range (crossing target boundary) → TEST_FIRST, never YES", () => {
  const st = freshState();
  addTest(st, "2026-08-29T09:00:00", { freeChlorine: range(1, 3), pH: val(7.2) });
  eq(S.canWeUseIt(st, NOW).verdict, "TEST_FIRST");
  const actions = S.diagnose({ freeChlorine: range(1, 3) }, S.SPA_TARGETS);
  ok(actions[0].retestOnly && !actions[0].blocksUse, "retest-only, no over-correction");
});

test("Hardness: 250 acceptable (~), 100 low, 500 high", () => {
  const T = S.SPA_TARGETS;
  eq(S.interpretHardness(val(250, true), T).status, "green");
  eq(S.interpretHardness(val(100, true), T).label, "Low");
  eq(S.interpretHardness(val(500, true), T).label, "High");
  eq(S.formatValue("hardness", val(250, true)), "~250 ppm");
});

console.log("\n== Freshness, dosing, water change ==");

test("Stale FC reading (5 days) → TEST FIRST / gray status", () => {
  const st = freshState();
  addTest(st, "2026-08-24T09:00:00", { freeChlorine: val(3), pH: val(7.2) });
  eq(S.canWeUseIt(st, NOW).verdict, "TEST_FIRST");
  eq(S.overallStatus(st, NOW).color, "gray");
});

test("Chemicals added after last test → TEST FIRST", () => {
  const st = freshState();
  addTest(st, "2026-08-29T08:00:00", { freeChlorine: val(3), pH: val(7.2) });
  S.addEvent(st, "chemical_added", { parameter: "freeChlorine" }, "", "2026-08-29T10:00:00");
  eq(S.canWeUseIt(st, NOW).verdict, "TEST_FIRST");
});

test("No dose without configured label data; scaling uses 5867 L", () => {
  eq(S.computeDose({ dosing: null }, S.SPA_PROFILE), null);
  const d = S.computeDose({ dosing: { labelDose: 100, unit: "g", referenceVolume: 1000 } }, S.SPA_PROFILE);
  eq(d.amount, 586.7, "100 g / 1000 L → 586.7 g for 5867 L");
});

test("Dynamic water change: 70d + CYA 30–50 → normal; 80d + CYA 100 → plan; 105d → due", () => {
  const mk = (refill, cya) => {
    const st = freshState();
    st.maintenance.lastRefillDate = refill;
    if (cya != null) addTest(st, "2026-08-28T09:00:00", { cya });
    return st;
  };
  eq(S.waterChangeAdvice(mk("2026-06-20T12:00:00", range(30, 50)), NOW).level, "none", "70d + good CYA");
  eq(S.waterChangeAdvice(mk("2026-06-10T12:00:00", val(100)), NOW).level, "plan", "80d + CYA 100");
  eq(S.waterChangeAdvice(mk("2026-05-15T12:00:00", null), NOW).level, "due", "106d by calendar");
});

console.log("\n== Fresh fill wizard ==");

test("Startup states are the required 9-step sequence", () => {
  eq(JSON.stringify(S.STARTUP_STATES),
     JSON.stringify(["refill", "initial_test", "alkalinity", "ph", "hardness", "chlorine", "cya_baseline", "final_test", "complete"]));
});

test("Resume: startup state persists through storage round-trip", () => {
  const st = freshState();
  st.startup = { active: true, state: "cya_baseline" };
  S.saveState(st);
  const back = S.loadState();
  ok(back.startup.active);
  eq(back.startup.state, "cya_baseline");
});

test("Fresh fill blocks use while in progress; complete step does not", () => {
  const st = freshState();
  st.startup = { active: true, state: "alkalinity" };
  eq(S.canWeUseIt(st, NOW).verdict, "NOT_YET");
  st.startup = { active: true, state: "complete" };
  ok(!S.startupInProgress(st), "complete is not in-progress");
});

test("finalTestOutcome: completes only when correctable params pass; CYA never gates", () => {
  const T = S.SPA_TARGETS;
  eq(S.finalTestOutcome(GOOD(), T), "complete");
  eq(S.finalTestOutcome(Object.assign(GOOD(), { freeChlorine: val(1) }), T), "chlorine", "low FC → chlorine step");
  eq(S.finalTestOutcome(Object.assign(GOOD(), { pH: val(8.4), alkalinity: val(40) }), T), "alkalinity", "TA outranks pH");
  eq(S.finalTestOutcome(Object.assign(GOOD(), { cya: val(150) }), T), "complete", "high CYA alone never blocks completion");
});

test("Fresh-fill chlorine step: FC 10 → do-not-add + retest only; FC 0 → add flow", () => {
  const st = freshState();
  st.startup = { active: true, state: "chlorine" };
  addTest(st, "2026-08-29T09:00:00", { freeChlorine: val(10) }, "fresh_fill", "retest");
  vm.runInContext("state = " + JSON.stringify(st), sandbox);
  const highHtml = vm.runInContext('freshFillBalanceStep("chlorine", new Date("2026-08-29T12:00:00"))', sandbox);
  ok(/Do not add more sanitizer/i.test(highHtml), "warns not to add");
  ok(!/I ADDED CHLORINE/.test(highHtml), "no add button at 10 ppm");
  const st2 = freshState();
  st2.startup = { active: true, state: "chlorine" };
  addTest(st2, "2026-08-29T09:00:00", { freeChlorine: val(0) }, "fresh_fill", "retest");
  vm.runInContext("state = " + JSON.stringify(st2), sandbox);
  const lowHtml = vm.runInContext('freshFillBalanceStep("chlorine", new Date("2026-08-29T12:00:00"))', sandbox);
  ok(/I ADDED CHLORINE/.test(lowHtml), "low FC offers Aqua Granular flow");
});

console.log("\n== Patterns, trends, misc ==");

test("Repeated low FC pattern (3 of last 5 normal checks)", () => {
  const st = freshState();
  [3, 1, 1, 3, 1].forEach((c, i) =>
    addTest(st, "2026-08-" + String(20 + i).padStart(2, "0") + "T09:00:00", { freeChlorine: val(c) }, "normal", "quick"));
  ok(S.detectPatterns(st, NOW).some(p => p.id === "low_fc"));
});

test("Post-play drop pattern needs repetition; not flagged after one occurrence", () => {
  const st = freshState();
  const play = when => S.addEvent(st, "swim_session", { bathers: 7, sessionType: "Kids playing", duration: "60+ min" }, "", when);
  addTest(st, "2026-08-20T09:00:00", { freeChlorine: val(3) }, "before_use", "quick");
  play("2026-08-20T15:00:00");
  addTest(st, "2026-08-21T08:00:00", { freeChlorine: val(1) }, "after_use", "quick");
  ok(!S.detectPatterns(st, NOW).some(p => p.id === "post_play_drop"), "one occurrence is not a pattern");
  addTest(st, "2026-08-24T09:00:00", { freeChlorine: val(3) }, "before_use", "quick");
  play("2026-08-24T15:00:00");
  addTest(st, "2026-08-25T08:00:00", { freeChlorine: val(1) }, "after_use", "quick");
  ok(S.detectPatterns(st, NOW).some(p => p.id === "post_play_drop"), "second occurrence confirms it");
});

test("Combined-chlorine buildup pattern on repeated elevated estimates", () => {
  const st = freshState();
  addTest(st, "2026-08-20T09:00:00", { freeChlorine: val(1), totalChlorine: val(3) });
  addTest(st, "2026-08-27T09:00:00", { freeChlorine: val(1), totalChlorine: val(3) });
  ok(S.detectPatterns(st, NOW).some(p => p.id === "cc_buildup"));
});

test("Seasonal pattern: higher low-FC rate in hot-soak mode with enough data", () => {
  const st = freshState();
  [3, 3, 3].forEach((c, i) => addTest(st, "2026-07-0" + (i + 1) + "T09:00:00", { freeChlorine: val(c) }, "normal", "quick", "summer_swim"));
  [1, 1, 3].forEach((c, i) => addTest(st, "2026-08-0" + (i + 1) + "T09:00:00", { freeChlorine: val(c) }, "normal", "quick", "hot_soak"));
  const p = S.detectPatterns(st, NOW).find(x => x.id === "seasonal_demand");
  ok(p && /hot-soak/i.test(p.title));
});

test("Chart points: combined series only from exact-read tests", () => {
  const st = freshState();
  addTest(st, "2026-08-20T09:00:00", { freeChlorine: val(1), totalChlorine: val(3) });
  addTest(st, "2026-08-21T09:00:00", { freeChlorine: range(1, 3), totalChlorine: val(3) });
  vm.runInContext("state = " + JSON.stringify(st), sandbox);
  const pts = vm.runInContext('chartPoints("combined", waterTests(state))', sandbox);
  eq(pts.length, 1, "approximate-read test excluded from combined series");
  eq(pts[0].v, 2);
});

test("Chart tooltip escapes user-controlled event text (no XSS)", () => {
  const html = S.tooltipHtml({ when: "Aug 29", param: "Free Chlorine", value: "3 ppm", status: "In range",
    context: "normal", age: "3 days", prev: 'Added <img src=x onerror=alert(1)> "chem"' });
  ok(!html.includes("<img"), "raw tag must not survive");
  ok(html.includes("&lt;img"), "tag is HTML-escaped");
});

test("Cycle summary includes sessions, high-load count, and CYA start/end", () => {
  const st = freshState();
  st.maintenance.lastRefillDate = "2026-08-01T12:00:00";
  S.addEvent(st, "refill", {}, "", "2026-08-01T12:00:00");
  addTest(st, "2026-08-02T09:00:00", { freeChlorine: val(3), cya: val(0) });
  addTest(st, "2026-08-28T09:00:00", { freeChlorine: val(3), cya: val(100) });
  S.addEvent(st, "swim_session", { bathers: 7, sessionType: "Kids playing", duration: "30–60 min" }, "", "2026-08-15T15:00:00");
  const cycles = S.waterCycles(st);
  const sum = S.cycleSummary(cycles[cycles.length - 1], S.SPA_TARGETS, NOW);
  eq(sum.sessionCount, 1);
  eq(sum.highLoadCount, 1);
  eq(S.asInterval(sum.cyaStart).lo, 0);
  eq(S.asInterval(sum.cyaEnd).lo, 100);
});

test("Timestamps: every test stores date, time, year, mode, temperature", () => {
  const st = freshState();
  const ev = addTest(st, "2026-08-29T10:57:00", { freeChlorine: val(3) });
  eq(ev.localDate, "2026-08-29");
  eq(ev.localTime, "10:57");
  eq(ev.year, 2026);
  ok(ev.data.operatingMode != null && ev.data.waterTemperatureF != null);
  eq(ev.data.precision, "discrete-strip");
});

test("State round-trips through storage with range readings intact", () => {
  const st = freshState();
  addTest(st, "2026-08-29T09:00:00", { freeChlorine: val(3), cya: range(30, 50) });
  S.saveState(st);
  const back = S.loadState();
  const cya = back.events[0].data.values.cya;
  ok(cya.approximate && cya.lower === 30 && cya.upper === 50, "range survives storage");
});

console.log("\n== Codex review regressions ==");

test("High TA in fresh fill: lowering guidance only, never the increaser", () => {
  const st = freshState();
  st.startup = { active: true, state: "alkalinity" };
  addTest(st, "2026-08-29T09:00:00", { alkalinity: val(180) }, "fresh_fill", "retest");
  vm.runInContext("state = " + JSON.stringify(st), sandbox);
  const html = vm.runInContext('freshFillBalanceStep("alkalinity", new Date("2026-08-29T12:00:00"))', sandbox);
  ok(/do not add alkalinity increaser/i.test(html), "explicit do-not-add guidance");
  ok(!/I ADDED ALK\+ BUFFER/.test(html), "no increaser button");
  ok(!/Alk\+ Buffer:/.test(html), "no increaser dose line");
  // Low TA still gets the increaser flow.
  const st2 = freshState();
  st2.startup = { active: true, state: "alkalinity" };
  addTest(st2, "2026-08-29T09:00:00", { alkalinity: val(40) }, "fresh_fill", "retest");
  vm.runInContext("state = " + JSON.stringify(st2), sandbox);
  const low = vm.runInContext('freshFillBalanceStep("alkalinity", new Date("2026-08-29T12:00:00"))', sandbox);
  ok(/I ADDED ALK\+ BUFFER/.test(low), "low TA offers the buffer");
});

test("Trend direction uses interval order — CYA 30–50 is never a midpoint", () => {
  eq(S.trendDirection([val(0), range(30, 50), val(100)]), "rising");
  eq(S.trendDirection([range(30, 50), range(30, 50), range(30, 50)]), "stable");
  eq(S.trendDirection([val(100), range(30, 50), val(0)]), "falling");
  // Overlapping intervals compare as equal (honest strip answer):
  eq(S.trendDirection([range(30, 50), val(40), range(30, 50)]), "stable");
});

test("CYA accumulation pattern is provable from bucket intervals, not midpoints", () => {
  const st = freshState();
  st.maintenance.lastRefillDate = "2026-06-01T12:00:00";
  S.addEvent(st, "refill", {}, "", "2026-06-01T12:00:00");
  // 30–50 → 30–50 → 100: newest floor (100) clears first ceiling (50) by
  // exactly 50 — provable rise from the buckets themselves.
  addTest(st, "2026-06-02T09:00:00", { cya: range(30, 50) });
  addTest(st, "2026-07-01T09:00:00", { cya: range(30, 50) });
  addTest(st, "2026-08-01T09:00:00", { cya: val(100) });
  ok(S.detectPatterns(st, NOW).some(p => p.id === "cya_accumulating"), "provable rise detected");
  // 0 → 30–50 → 30–50: floor 30 vs ceiling 0 = 30 ppm — not provably ≥50.
  const st2 = freshState();
  st2.maintenance.lastRefillDate = "2026-06-01T12:00:00";
  S.addEvent(st2, "refill", {}, "", "2026-06-01T12:00:00");
  addTest(st2, "2026-06-02T09:00:00", { cya: val(0) });
  addTest(st2, "2026-07-01T09:00:00", { cya: range(30, 50) });
  addTest(st2, "2026-08-01T09:00:00", { cya: range(30, 50) });
  ok(!S.detectPatterns(st2, NOW).some(p => p.id === "cya_accumulating"), "ambiguous rise not over-claimed");
});

test("Dose guidance escapes user-entered units (no XSS)", () => {
  const st = freshState();
  const shock = st.chemicalInventory.find(c => c.id === "aqua_shock");
  shock.dosing = { labelDose: 10, unit: 'g</b><img src=x onerror=alert(1)>', referenceVolume: 1000 };
  vm.runInContext("state = " + JSON.stringify(st), sandbox);
  const html = vm.runInContext('doseLine("oxidizer")', sandbox);
  ok(!html.includes("<img"), "raw tag must not survive");
  ok(html.includes("&lt;img"), "unit is HTML-escaped");
});

test("Previous-cycle trend range returns only the prior cycle's tests", () => {
  const st = freshState();
  addTest(st, "2026-05-01T09:00:00", { freeChlorine: val(3) });        // cycle 1 (pre-refill era)
  S.addEvent(st, "refill", {}, "", "2026-06-01T12:00:00");
  addTest(st, "2026-06-05T09:00:00", { freeChlorine: val(3) });        // cycle 2
  st.maintenance.lastRefillDate = "2026-08-01T12:00:00";
  S.addEvent(st, "refill", {}, "", "2026-08-01T12:00:00");
  addTest(st, "2026-08-05T09:00:00", { freeChlorine: val(3) });        // cycle 3 (current)
  vm.runInContext("state = " + JSON.stringify(st), sandbox);
  const prev = vm.runInContext('trendRangeTests("prev", new Date("2026-08-29T12:00:00"))', sandbox);
  eq(prev.length, 1, "one test in the previous cycle");
  eq(prev[0].localDate, "2026-06-05");
});


console.log("\n== Result swatches ==");

test("Exact readings show their single matched pad color", () => {
  const html = S.padSwatchHtml("freeChlorine", val(3), "easytest_7in1");
  ok(html.includes(S.PAD_COLORS.freeChlorine[3]), "FC 3 bucket color used");
  ok(html.includes("pad-swatch"), "renders the swatch span");
});

test("Between-two-colors readings show a split swatch of both buckets", () => {
  const html = S.padSwatchHtml("alkalinity", range(80, 120), "easytest_7in1");
  ok(html.includes("linear-gradient"), "split swatch");
  ok(html.includes(S.PAD_COLORS.alkalinity[80]) && html.includes(S.PAD_COLORS.alkalinity[120]),
     "both bucket colors present");
});

test("CYA 30-50 bucket shows its own single pad color", () => {
  const html = S.padSwatchHtml("cya", range(30, 50), "easytest_7in1");
  ok(!html.includes("linear-gradient"), "native bucket is one pad, not a split");
  ok(html.includes(S.PAD_COLORS.cya["30-50"]));
});

test("Readings with no matching bucket render no swatch", () => {
  eq(S.padSwatchHtml("freeChlorine", val(2), "easytest_7in1"), "", "2 ppm is not a strip bucket");
  eq(S.padSwatchHtml("nope", val(3), "easytest_7in1"), "", "unknown parameter");
});

test("Timeline test chips carry swatches and escape text", () => {
  const st = freshState();
  const ev = addTest(st, "2026-08-29T09:00:00", { freeChlorine: val(3), cya: range(30, 50) });
  vm.runInContext("state = " + JSON.stringify(st), sandbox);
  const html = vm.runInContext("testValuesHtml(state.events[0])", sandbox);
  ok(html.includes("reading-chip"), "chips rendered");
  ok((html.match(/pad-swatch/g) || []).length === 2, "one swatch per reading");
  ok(html.includes("FC 3") && html.includes("CYA 30\u201350"), "numbers remain canonical");
});

console.log("\n== Exact label-dosing engine ==");

const TA_RATE = { labelDose: 20, unit: "g", referenceVolume: 1000, effect: 10,
  labelText: "Add 20 g per 1,000 L to raise total alkalinity by 10 ppm." };
const taProduct = d => ({ name: "TA test product", dosing: d });
const taCtx = cur => ({ param: "alkalinity", current: cur, target: { min: 80, max: 120 }, direction: "raise" });

test("Rate dosing: exact label math scaled to 5,867 L", () => {
  // 40 → aim 100 is Δ60; label: 20 g raises 10 ppm per 1,000 L
  // → 20 × (60/10) × 5.867 = 704.04 g → rounded to label-practical 705 g.
  const d = S.computeDose(taProduct(TA_RATE), S.SPA_PROFILE, taCtx(val(40)));
  eq(d.amount, 705);
  eq(d.unit, "g");
  eq(d.basis, "rate");
  ok(/20 g per 1,000 L/.test(d.labelText), "label text carried verbatim");
});

test("Range readings dose from the conservative endpoint", () => {
  // 40–80 read: dose from 80 (smaller dose) → Δ20 → 20×2×5.867 = 234.68 → 235.
  const d = S.computeDose(taProduct(TA_RATE), S.SPA_PROFILE, taCtx(range(40, 80)));
  eq(d.amount, 235);
  eq(d.usedReading, 80);
  ok(d.conservative, "flagged as conservative");
});

test("No dose when the conservative read is already at/inside target", () => {
  ok(S.computeDose(taProduct(TA_RATE), S.SPA_PROFILE, taCtx(val(120))).noDoseNeeded);
  ok(S.computeDose(taProduct(TA_RATE), S.SPA_PROFILE, taCtx(range(80, 120))).noDoseNeeded);
});

test("Label max single treatment caps the dose and never rounds above it", () => {
  const capped = Object.assign({}, TA_RATE, { maxPerTreatment: 50 }); // 50 g per 1,000 L
  const d = S.computeDose(taProduct(capped), S.SPA_PROFILE, taCtx(val(40)));
  const maxScaled = 50 * S.SPA_PROFILE.volumeLitres / 1000; // 293.35
  ok(d.staged, "flagged as staged");
  ok(d.amount <= maxScaled, "amount " + d.amount + " must not exceed label max " + maxScaled);
});

test("Engine refuses a chlorine dose at/above 10 ppm regardless of caller", () => {
  const fcProduct = { name: "chlorine", dosing: { labelDose: 35, referenceVolume: 1000, effect: 5 } };
  const d = S.computeDose(fcProduct, S.SPA_PROFILE,
    { param: "freeChlorine", current: val(10), target: { min: 3, max: 5 }, direction: "raise" });
  ok(d && d.refuse, "refusal returned");
});

test("Table dosing: reading-keyed lookup; uncovered readings return null", () => {
  const phDown = { name: "pH down", dosing: { unit: "g", referenceVolume: 1000,
    table: { "8.4": 30, "9.0": 45 } } };
  const ctx = cur => ({ param: "pH", current: cur, target: { min: 7.2, max: 7.8 }, direction: "lower" });
  const d = S.computeDose(phDown, S.SPA_PROFILE, ctx(val(8.4)));
  eq(d.amount, 175);            // 30 × 5.867 = 176.01 → 175
  eq(d.basis, "table");
  // Lowering from a 7.8–8.4 range: conservative endpoint is 7.8, which
  // the label table doesn't cover → no invented dose.
  eq(S.computeDose(phDown, S.SPA_PROFILE, ctx(range(7.8, 8.4))), null);
});

test("CYA contribution surfaces only from label-stated data", () => {
  const chlor = { name: "chlorine", dosing: { labelDose: 35, referenceVolume: 1000, effect: 5, cyaPerDose: 3 } };
  const ctx = { param: "freeChlorine", current: val(1), target: { min: 3, max: 5 }, direction: "raise" };
  const d = S.computeDose(chlor, S.SPA_PROFILE, ctx);
  // Δ3 → 35×0.6×5.867 = 123.2 → 125 g; CYA = 3 × (125/5.867)/35 ≈ 1.8 ppm
  eq(d.amount, 125);
  eq(d.addsCya, 1.8);
  const noCya = { name: "chlorine", dosing: { labelDose: 35, referenceVolume: 1000, effect: 5 } };
  ok(S.computeDose(noCya, S.SPA_PROFILE, ctx).addsCya === undefined, "no invented CYA figure");
});

test("Migration: existing installs adopt factory label data unless user-configured", () => {
  // Simulate factory data arriving in an update while a device already
  // has the inventory stored with dosing: null.
  const st = freshState();
  const stored = JSON.parse(JSON.stringify(st));
  stored.chemicalInventory.find(c => c.id === "aqua_shock").dosing = null;      // pre-label install
  stored.chemicalInventory.find(c => c.id === "aqua_shock").name = "Aqua Shock";
  stored.chemicalInventory.find(c => c.id === "piper_cal").dosing = { labelDose: 99, unit: "g", referenceVolume: 500 };
  stored.chemicalInventory.find(c => c.id === "piper_cal").name = "Piper Clear Cal";  // old guessed name
  S.saveState(stored);
  const back = S.loadState();
  eq(back.chemicalInventory.find(c => c.id === "aqua_shock").dosing.labelDose, 150, "factory label dosing adopted");
  eq(back.chemicalInventory.find(c => c.id === "piper_cal").dosing.labelDose, 99, "user dosing config preserved");
  eq(back.chemicalInventory.find(c => c.id === "piper_cal").name, "Pool Life Cal", "factory name adopted over old guess");
});


test("Preloaded label data: exact doses for the XL4 (5,867 L)", () => {
  const st = freshState();
  const by = id => st.chemicalInventory.find(c => c.id === id);
  // Pool Life Alk+ Buffer: 180 g / 10 ppm / 10,000 L, label aim 100 ppm.
  // TA 40 → Δ60 → 180 × 6 × 0.5867 = 633.6 → 635 g.
  const alk = S.computeDose(by("piper_alk_buffer"), S.SPA_PROFILE,
    { param: "alkalinity", current: val(40), target: { min: 80, max: 120 }, direction: "raise" });
  eq(alk.amount, 635); eq(alk.aim, 100);
  // Pool Life Cal: 112 g / 10 ppm / 10,000 L. CH 100 → aim 200 → Δ100
  // → 112 × 10 × 0.5867 = 657.1 → 655 g.
  const cal = S.computeDose(by("piper_cal"), S.SPA_PROFILE,
    { param: "hardness", current: val(100, true), target: { min: 150, max: 250 }, direction: "raise" });
  eq(cal.amount, 655);
  // Flat repeat-dose products scale 10,000 L → 5,867 L:
  eq(S.computeDose(by("piper_ph_down"), S.SPA_PROFILE).amount, 58.7);
  eq(S.computeDose(by("aqua_ph_plus"), S.SPA_PROFILE).amount, 58.7);
  eq(S.computeDose(by("aqua_shock"), S.SPA_PROFILE).amount, 88);
  eq(S.computeDose(by("aqua_granular"), S.SPA_PROFILE).amount, 23.5);
  // Label text rides along verbatim.
  ok(/Wait at least 2 hours/.test(alk.labelText));
});

test("Corrected product names: Pool Life brand (was 'Piper Clear' guess)", () => {
  const st = freshState();
  eq(st.chemicalInventory.find(c => c.id === "piper_alk_buffer").name, "Pool Life Alk+ Buffer");
  eq(st.chemicalInventory.find(c => c.id === "piper_ph_down").name, "Pool Life pH Down");
  eq(st.chemicalInventory.find(c => c.id === "piper_cal").name, "Pool Life Cal");
});

/* ---------------- summary ---------------- */
console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
