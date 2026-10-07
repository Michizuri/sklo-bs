// Regression tests: drives index.html in headless Chromium and checks detection + exports.
// Run:  npm install && npx playwright install chromium && npm test
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appUrl = pathToFileURL(path.join(here, "..", "index.html")).href;
const fx = (f) => path.join(here, "fixtures", f);
const outRoot = path.join(here, "output");

// Ground truth of the synthetic 3-panel drawings (mm): panels left→right, cutouts as [left, bottom, w, h]
const TRUTH = [
  { W: 1200, H: 548, cuts: [[100, 250, 140, 65], [900, 400, 140, 65]] },
  { W: 900, H: 548, cuts: [[600, 300, 70, 65]] },
  { W: 1600, H: 600, cuts: [[50, 200, 140, 65]] },
];
const TOL_MM = 3; // drawing scale is 0.4 px/mm -> 1 px = 2.5 mm

let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? "  ok  " : "  FAIL"} ${msg}`); if (!ok) failures++; };

function pngInfo(file) {
  const b = fs.readFileSync(file);
  const info = { w: b.readUInt32BE(16), h: b.readUInt32BE(20), dpi: null };
  for (let off = 8; off < b.length;) {
    const len = b.readUInt32BE(off), type = b.toString("ascii", off + 4, off + 8);
    if (type === "pHYs") info.dpi = Math.round(b.readUInt32BE(off + 8) * 0.0254 * 10) / 10;
    if (type === "IDAT") break;
    off += 12 + len;
  }
  return info;
}

async function scenario(name, { drawing, motif, sizes, fit, fields = {}, sliders = {}, exportFiles = false }, verify) {
  console.log(`\n# ${name}`);
  const page = await browser.newPage({ acceptDownloads: true });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto(appUrl);
  await page.click("[data-lang=en]");
  await page.setInputFiles("#dropDrawing input", drawing);
  await page.waitForFunction(() => window.__app.S.drawing);
  await page.setInputFiles("#dropMotif input", motif);
  await page.waitForFunction(() => window.__app.S.motif);
  for (let i = 0; i < sizes.length; i++) {
    await page.fill(`#panelRows tr:nth-child(${i + 1}) input[data-dim=w]`, String(sizes[i][0]));
    await page.fill(`#panelRows tr:nth-child(${i + 1}) input[data-dim=h]`, String(sizes[i][1]));
  }
  if (fit) await page.click(`#fitSeg label:has(input[value=${fit}])`);
  for (const [id, v] of Object.entries(sliders)) await page.evaluate(([id, v]) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event("input")); }, [id, v]);
  for (const [id, v] of Object.entries(fields)) await page.fill(`#${id}`, String(v));
  await page.waitForTimeout(300);
  const L = await page.evaluate(() => {
    const L = window.__app.compute();
    return { panels: L.panels, Wtot: L.Wtot, Htot: L.Htot, M: L.M, msgs: L.msgs, mode: window.__app.S.drawing.A.mode };
  });
  let files = [];
  if (exportFiles) {
    const dir = path.join(outRoot, name.replace(/\W+/g, "_"));
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    const pending = [];
    page.on("download", (d) => pending.push(d.saveAs(path.join(dir, d.suggestedFilename())).then(() => path.join(dir, d.suggestedFilename()))));
    await page.click("#btnDownload");
    await page.waitForFunction(() => /Done|Error/.test(document.getElementById("status").textContent), null, { timeout: 180000 });
    await page.waitForTimeout(1000);
    files = await Promise.all(pending);
    check(/Done/.test(await page.textContent("#status")), `export finished: ${await page.textContent("#status")}`);
  }
  check(errors.length === 0, `no page errors ${errors.length ? JSON.stringify(errors) : ""}`);
  await verify(L, files);
  await page.close();
}

function verifyLayout(L) {
  check(L.panels.length === TRUTH.length, `${TRUTH.length} panels detected (got ${L.panels.length}, mode ${L.mode})`);
  L.panels.forEach((p, i) => {
    const t = TRUTH[i]; if (!t) return;
    check(p.W === t.W && p.H === t.H, `panel ${i + 1} is ${t.W}×${t.H} (reading order)`);
    check(p.cuts.length === t.cuts.length, `panel ${i + 1}: ${t.cuts.length} cutouts (got ${p.cuts.length})`);
    p.cuts.forEach((c, j) => {
      const [l, b, w, h] = t.cuts[j] || [];
      const gotB = p.H - c.top - c.h;
      check(Math.abs(c.left - l) <= TOL_MM && Math.abs(gotB - b) <= TOL_MM && c.w === w && c.h === h,
        `panel ${i + 1} cutout ${j + 1}: left ${c.left.toFixed(1)} (exp ${l}), bottom ${gotB.toFixed(1)} (exp ${b}), ${c.w}×${c.h}`);
    });
  });
}

fs.mkdirSync(outRoot, { recursive: true });
const browser = await chromium.launch();

await scenario("3 panels, grey background, tiles, export",
  { drawing: fx("drawing_3panels_grey.png"), motif: fx("motif_pattern.png"), sizes: TRUTH.map((t) => [t.W, t.H]), fit: "tile", fields: { tileH: 300, dpi: 100 }, exportFiles: true },
  (L, files) => {
    verifyLayout(L);
    check(L.Wtot === 3700 && L.Htot === 600, `wall is 3700×600 mm`);
    check(Math.abs(L.M.dpi - 80) < 0.5, `tile of 945 px at 300 mm = 80 DPI (got ${L.M.dpi.toFixed(1)})`);
    check(files.length === 6, `6 files exported (got ${files.length})`);
    const ppm = 100 / 25.4;
    TRUTH.forEach((t, i) => {
      const f = files.find((x) => x.includes(`_panel${i + 1}_`));
      const inf = f && pngInfo(f);
      check(inf && inf.w === Math.round(t.W * ppm) && inf.h === Math.round(t.H * ppm) && inf.dpi === 100,
        `panel ${i + 1} PNG ${inf ? `${inf.w}×${inf.h} @${inf.dpi} DPI` : "missing"}`);
    });
  });

await scenario("3 panels, white background",
  { drawing: fx("drawing_3panels_white.png"), motif: fx("motif_panorama.png"), sizes: TRUTH.map((t) => [t.W, t.H]) },
  (L) => verifyLayout(L));

await scenario("typo in a panel size is flagged",
  { drawing: fx("drawing_3panels_grey.png"), motif: fx("motif_panorama.png"), sizes: [[1300, 548], [900, 548], [1600, 600]] },
  (L) => {
    check(L.panels[0].bad.w && !L.panels[0].bad.h && !L.panels[1].bad.w && !L.panels[2].bad.w, "only panel 1 width flagged");
    check(L.msgs.some(([c, t]) => c === "err" && /Panel 1/.test(t)), "error message shown");
  });

await scenario("fill mode: no distortion, native DPI",
  { drawing: fx("drawing_3panels_grey.png"), motif: fx("motif_panorama.png"), sizes: TRUTH.map((t) => [t.W, t.H]), fit: "fill" },
  (L) => {
    check(L.M.distort === 0, "no distortion");
    const exp = 25.4 / Math.max(3700 / 4000, 600 / 800);
    check(Math.abs(L.M.dpi - exp) < 0.1, `native ${L.M.dpi.toFixed(1)} DPI (exp ${exp.toFixed(1)})`);
    check(L.msgs.some(([c]) => c === "warn"), "upscaling warning shown");
  });

await browser.close();
console.log(failures ? `\n${failures} check(s) FAILED` : "\nall checks passed");
process.exit(failures ? 1 : 0);
