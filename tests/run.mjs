// Regression tests: drives index.html in headless Chromium and checks detection + exports.
//   npm test             synthetic fixtures (committed) + local samples/ (gitignored)
//   npm run samples      local samples/ only
// First run: npm install && npx playwright install chromium
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const appUrl = pathToFileURL(path.join(root, "index.html")).href;
const fx = (f) => path.join(here, "fixtures", f);
const outRoot = path.join(here, "output");
const samplesDir = path.join(root, "samples");
const samplesOnly = process.argv.includes("--samples-only");

let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? "  ok  " : "  FAIL"} ${msg}`); if (!ok) failures++; return ok; };

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

/* ------------------------------------------------------------ app driver */
// Loads files, applies settings, optionally exports. Returns the computed layout + exported file paths.
async function runApp(outDir, { drawing, motif, sizes = [], fit, dpi, gap, tileH, sliders = {}, exportFiles = false }) {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1200 }, acceptDownloads: true });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto(appUrl);
  await page.click("[data-lang=en]");
  await page.setInputFiles("#dropDrawing input", drawing);
  await page.waitForFunction(() => window.__app.S.drawing, null, { timeout: 60000 });
  if (motif) {
    await page.setInputFiles("#dropMotif input", motif);
    await page.waitForFunction(() => window.__app.S.motif, null, { timeout: 60000 });
  }
  const nPanels = await page.evaluate(() => window.__app.S.drawing.A.panels.length);
  for (let i = 0; i < Math.min(sizes.length, nPanels); i++) {
    if (sizes[i][0] != null) await page.fill(`#panelRows tr:nth-child(${i + 1}) input[data-dim=w]`, String(sizes[i][0]));
    if (sizes[i][1] != null) await page.fill(`#panelRows tr:nth-child(${i + 1}) input[data-dim=h]`, String(sizes[i][1]));
  }
  if (fit) await page.click(`#fitSeg label:has(input[value=${fit}])`);
  for (const [id, v] of Object.entries(sliders)) {
    await page.evaluate(([id, v]) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event("input")); }, [id, v]);
  }
  if (dpi != null) await page.fill("#dpi", String(dpi));
  if (gap != null) await page.fill("#gap", String(gap));
  if (tileH != null) await page.fill("#tileH", String(tileH));
  await page.waitForTimeout(300);

  const L = await page.evaluate(() => {
    const L = window.__app.compute();
    return { panels: L.panels || [], Wtot: L.Wtot, Htot: L.Htot, M: L.M, msgs: L.msgs, mode: window.__app.S.drawing.A.mode, dpi: window.__app.S.dpi };
  });
  await page.screenshot({ path: path.join(outDir, "ui.png"), fullPage: true });

  let files = [];
  if (exportFiles) {
    if (await page.isDisabled("#btnDownload")) {
      check(false, "export button is enabled");
    } else {
      const pending = [];
      page.on("download", (d) => { const p = path.join(outDir, d.suggestedFilename()); pending.push(d.saveAs(p).then(() => p)); });
      await page.click("#btnDownload");
      await page.waitForFunction(() => /Done|Error/.test(document.getElementById("status").textContent), null, { timeout: 300000 });
      await page.waitForTimeout(1000);
      files = await Promise.all(pending);
      const status = await page.textContent("#status");
      check(/Done/.test(status), `export: ${status}`);
    }
  }
  check(errors.length === 0, `no page errors${errors.length ? " " + JSON.stringify(errors) : ""}`);
  await page.close();
  return { L, files };
}

function checkLayout(L, panels, cutouts, tol) {
  check(L.panels.length === panels.length, `${panels.length} panel(s) detected (got ${L.panels.length}, outline mode ${L.mode})`);
  L.panels.forEach((p, i) => {
    if (!panels[i]) return;
    check(!p.bad.w && !p.bad.h, `panel ${i + 1} ${panels[i][0]}×${panels[i][1]} mm matches the drawing proportions`);
    const exp = cutouts && cutouts[i];
    if (!exp) return;
    check(p.cuts.length === exp.length, `panel ${i + 1}: ${exp.length} cutout(s) (got ${p.cuts.length})`);
    p.cuts.forEach((c, j) => {
      if (!exp[j]) return;
      const [l, b, w, h] = exp[j], gotB = p.H - c.top - c.h;
      check(Math.abs(c.left - l) <= tol && Math.abs(gotB - b) <= tol && Math.abs(c.w - w) <= tol && Math.abs(c.h - h) <= tol,
        `panel ${i + 1} cutout ${j + 1}: left ${c.left.toFixed(1)} (exp ${l}), bottom ${gotB.toFixed(1)} (exp ${b}), ${c.w}×${c.h} (exp ${w}×${h})`);
    });
  });
}

function checkExports(L, files, dpi) {
  const ppm = dpi / 25.4;
  L.panels.forEach((p) => {
    const f = files.find((x) => new RegExp(`_(panel|sklo)${p.n}_`).test(path.basename(x)));
    const inf = f && pngInfo(f);
    const ew = Math.round(p.W * ppm), eh = Math.round(p.H * ppm);
    check(inf && Math.abs(inf.w - ew) <= 1 && inf.h === eh && Math.abs(inf.dpi - dpi) < 0.2,
      `panel ${p.n} PNG ${inf ? `${inf.w}×${inf.h} @${inf.dpi} DPI` : "missing"} (exp ${ew}×${eh} @${dpi})`);
  });
  check(files.some((f) => /_(preview|nahled)\.png$/.test(f)), "preview PNG exported");
}

/* ------------------------------------------------- synthetic fixtures */
// Ground truth of the synthetic 3-panel drawings (mm): panels left→right, cutouts [left, bottom, w, h]
const TRUTH_PANELS = [[1200, 548], [900, 548], [1600, 600]];
const TRUTH_CUTS = [[[100, 250, 140, 65], [900, 400, 140, 65]], [[600, 300, 70, 65]], [[50, 200, 140, 65]]];

async function fixtureTests() {
  const out = (n) => path.join(outRoot, "fixtures", n);

  console.log("\n# fixture: 3 panels, grey background, tiles, export");
  {
    const { L, files } = await runApp(out("tiles"), { drawing: fx("drawing_3panels_grey.png"), motif: fx("motif_pattern.png"), sizes: TRUTH_PANELS, fit: "tile", tileH: 300, dpi: 100, exportFiles: true });
    checkLayout(L, TRUTH_PANELS, TRUTH_CUTS, 3);
    check(L.Wtot === 3700 && L.Htot === 600, "wall is 3700×600 mm");
    check(Math.abs(L.M.dpi - 80) < 0.5, `tile 945 px tall at 300 mm = 80 DPI (got ${L.M.dpi.toFixed(1)})`);
    check(files.length === 6, `6 files exported (got ${files.length})`);
    checkExports(L, files, 100);
  }

  console.log("\n# fixture: 3 panels, white background");
  {
    const { L } = await runApp(out("white"), { drawing: fx("drawing_3panels_white.png"), motif: fx("motif_panorama.png"), sizes: TRUTH_PANELS });
    checkLayout(L, TRUTH_PANELS, TRUTH_CUTS, 3);
  }

  console.log("\n# fixture: typo in a panel size is flagged");
  {
    const { L } = await runApp(out("typo"), { drawing: fx("drawing_3panels_grey.png"), motif: fx("motif_panorama.png"), sizes: [[1300, 548], [900, 548], [1600, 600]] });
    check(L.panels[0].bad.w && !L.panels[0].bad.h && !L.panels[1].bad.w && !L.panels[2].bad.w, "only panel 1 width flagged");
    check(L.msgs.some(([c, t]) => c === "err" && /Panel 1/.test(t)), "error message shown");
  }

  console.log("\n# fixture: fill mode, no distortion, native DPI");
  {
    const { L } = await runApp(out("fill"), { drawing: fx("drawing_3panels_grey.png"), motif: fx("motif_panorama.png"), sizes: TRUTH_PANELS, fit: "fill" });
    check(L.M.distort === 0, "no distortion");
    const exp = 25.4 / Math.max(3700 / 4000, 600 / 800);
    check(Math.abs(L.M.dpi - exp) < 0.1, `native ${L.M.dpi.toFixed(1)} DPI (exp ${exp.toFixed(1)})`);
    check(L.msgs.some(([c]) => c === "warn"), "upscaling warning shown");
  }
}

/* -------------------------------------------------- local samples/ */
const IMG = /\.(png|jpe?g|webp)$/i;
function pickFile(files, prefix, base) {
  return files.find((f) => IMG.test(f) && f.startsWith(prefix)) || files.find((f) => IMG.test(f) && path.parse(f).name.toLowerCase() === base);
}

async function sampleTests() {
  if (!fs.existsSync(samplesDir)) return 0;
  const jobs = fs.readdirSync(samplesDir, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith("_")).map((d) => d.name).sort();
  if (!jobs.length) { console.log("\n(no local samples in samples/ — see samples/README.md)"); return 0; }

  for (const job of jobs) {
    const dir = path.join(samplesDir, job), files = fs.readdirSync(dir), out = path.join(outRoot, "samples", job);
    console.log(`\n# sample: ${job}`);
    const caseFile = path.join(dir, "case.json");
    let cfg = {};
    if (fs.existsSync(caseFile)) {
      try { cfg = JSON.parse(fs.readFileSync(caseFile, "utf8")); } catch (e) { check(false, `case.json is valid JSON (${e.message})`); continue; }
    }
    const drawing = cfg.drawing || pickFile(files, "1_", "drawing");
    const motif = cfg.motif || pickFile(files, "2_", "motif");
    if (!check(!!drawing, `drawing found (${drawing || 'name it "1_…" or "drawing.png"'})`)) continue;
    if (!check(!!motif, `motif found (${motif || 'name it "2_…" or "motif.jpg"'})`)) continue;

    const complete = Array.isArray(cfg.panels) && cfg.panels.length && cfg.panels.every((p) => p && p[0] && p[1]);
    const dpi = cfg.dpi ?? 150;
    const { L, files: exported } = await runApp(out, {
      drawing: path.join(dir, drawing), motif: path.join(dir, motif),
      sizes: complete ? cfg.panels : [], fit: cfg.fit, dpi: cfg.dpi, gap: cfg.gap, tileH: cfg.tileH, sliders: cfg.sliders,
      exportFiles: complete && cfg.export !== false,
    });

    if (!complete) {
      const n = L.panels.length;
      console.log(`  ..   ${n} panel(s) detected, cutouts per panel: ${L.panels.map((p) => p.cuts.length).join(", ") || "-"}`);
      if (!fs.existsSync(caseFile)) {
        fs.writeFileSync(caseFile, JSON.stringify({ panels: Array.from({ length: n }, () => [null, null]), fit: "fill", dpi: 150, export: true }, null, 2) + "\n");
        console.log(`  ..   wrote template ${path.relative(root, caseFile)} — fill in panel sizes [width, height] mm and run again`);
      } else {
        console.log(`  ..   ${path.relative(root, caseFile)} has no complete "panels" — fill in sizes [width, height] mm`);
      }
      console.log(`  ..   screenshot: ${path.relative(root, path.join(out, "ui.png"))}`);
      continue;
    }

    checkLayout(L, cfg.panels, cfg.cutouts, cfg.toleranceMm ?? 3);
    if (L.M) console.log(`  ..   motif at ${L.M.dpi.toFixed(0)} DPI native, printing at ${L.dpi} DPI${L.M.distort ? `, distorted ${L.M.distort.toFixed(1)} %` : ""}`);
    for (const [c, t] of L.msgs) if (c !== "info") console.log(`  ..   app ${c}: ${t}`);
    if (cfg.export !== false && exported.length) checkExports(L, exported, dpi);
    console.log(`  ..   output: ${path.relative(root, out)}/`);
  }
  return jobs.length;
}

/* ------------------------------------------------------------------ main */
const browser = await chromium.launch();
try {
  if (!samplesOnly) await fixtureTests();
  await sampleTests();
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} check(s) FAILED` : "\nall checks passed");
process.exit(failures ? 1 : 0);
