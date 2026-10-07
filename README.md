# sklo-bs – sesazení motivu na sklo

**Live: https://sklo.michizuri.com**

Browser tool that places a motif (Shutterstock image, pattern, preview) onto kitchen glass panels using the SketchUp measurement drawing, and exports print-ready PNGs plus a control preview with magenta cutouts.

**The whole app is `index.html`.** No install, no Python, no build step. Everything runs locally in the browser; images never leave the computer.

---

## Návod (pro zákazníka)

1. Otevřete **https://sklo.michizuri.com** (nebo dvakrát klikněte na `index.html`). Doporučený prohlížeč: **Chrome nebo Edge**.
2. Přetáhněte **zaměření** (PNG ze SketchUpu) do pole 1.
3. Přetáhněte **motiv** do pole 2.
4. V tabulce *Skla* opište **šířku a výšku každého skla** (z objednávky / zaměření). Pokud rozměr nesedí s výkresem, pole zčervená.
5. Zvolte umístění motivu:
   - **Vyplnit** – motiv pokryje všechna skla, přesah se ořízne (posuvníky určují, která část motivu se použije). Bez deformace.
   - **Roztáhnout** – motiv se natáhne přesně na skla (deformuje se, aplikace ukáže o kolik %).
   - **Dlaždice** – pro opakující se vzory; nastavte výšku dlaždice.
6. Zkontrolujte náhled a sekci **Kontroly**. Když je motiv malý, aplikace ukáže, kolikrát se bude zvětšovat. Tlačítko **Nezvětšovat motiv** sníží DPI tak, aby se obrázek nezvětšoval.
7. **Uložit vše do složky…** (nebo *Stáhnout soubory*).

Výstup:

| Soubor | Obsah |
|---|---|
| `…_sklo1_2008x548mm_150dpi.png` | tisková data pro každé sklo (bez výřezů), DPI zapsané v souboru |
| `…_MASTER_…png` | celý motiv přes všechna skla (vynechá se, pokud by byl pro prohlížeč příliš velký) |
| `…_nahled.png` | kontrolní náhled s fialovými výřezy a spárami |
| `…_souhrn.txt` | rozměry, polohy výřezů, nastavení, rozlišení |

---

## What the drawing must look like

- SketchUp **front view, parallel projection** (to scale – no perspective).
- Panels = **white faces with the default thick outline** ("Profiles" edge style, 2+ px). Dimension lines can be anywhere, they are ignored.
- Socket cutouts = **yellow** rectangles inside the panels.
- Any number of panels, arranged in **reading order** (rows top→bottom, left→right in a row) = their order on the wall left→right.
- Panels with different heights are aligned to the bottom edge (worktop).

Fallback: if the outlines are only 1 px, detection still works, but a dimension line drawn completely across a panel will split it in two (you'll see a wrong panel count immediately).

## Accuracy and limits

- **Panel sizes are typed in**, not read from the drawing. Reading the numbers (OCR) proved unreliable; measuring them from pixels is ~0.3 % off (6 mm on 2 m), which is too much for print data. The app cross-checks typed sizes against the drawing proportions (1.5 % tolerance) to catch typos and wrong order.
- **Cutouts are measured from pixels**: about ±1 drawing px (~2 mm at a typical zoom). Fine for the control preview, **not** for CNC cutting – the glass shop cuts from the dimensions in the drawing.
- Sizes of cutouts are rounded to 5 mm by default (checkbox).
- Browser limits: a single image can be at most 32 767 px wide (≈ 5.5 m at 150 DPI). Bigger panels → lower the DPI.
- Tested in Chromium (Chrome/Edge). Firefox should work but can't "save to folder" (uses downloads instead). Safari untested.

---

## Development

Edit `index.html`, reload the browser. That's the whole workflow – no environment, no dependencies.

- Tunables are in the `CFG` object at the top of the script (tolerances, DPI warning threshold, preview width, seam width).
- Texts are in `I18N` (Czech + English).
- Releasing: bump `VERSION` in `index.html`, commit, push to `main`. GitHub Actions runs the tests and, if they pass, publishes to https://sklo.michizuri.com (takes ~2 min). A failing test blocks the deploy, so the live version never breaks. Tag releases if you want named versions (`git tag v0.2.0 && git push --tags`).
- Work on a branch → tests run, nothing is deployed. Merge to `main` to go live.

### Tests (needs Node.js 20+)

```bash
npm install
npx playwright install chromium
npm test            # synthetic fixtures + your local samples
npm run samples     # only your local samples
```

- `tests/fixtures/` – synthetic drawings and motifs (committed, no client content): 3 panels in two rows, different heights, grey and white background, dimension lines crossing panels. Checks panel order, cutout positions, size validation, exported PNG sizes and DPI.
- `samples/` – **real client jobs, gitignored**. One folder per job with the drawing, motif and an optional `case.json` of expected values. See [samples/README.md](samples/README.md).
- Screenshots and exported files of every run land in `tests/output/` (gitignored). In CI they're attached to the run as an artifact when a test fails.

---

## Hosting (GitHub Pages + Cloudflare) – one-time setup

The repo is private; the site is published by `.github/workflows/deploy.yml` (only `index.html` is published, never tests or samples).

1. **GitHub → repo Settings → Pages**
   - *Build and deployment → Source*: **GitHub Actions**
   - *Custom domain*: `sklo.michizuri.com` → Save
2. **Cloudflare → michizuri.com → DNS → Add record**
   - Type `CNAME`, Name `sklo`, Target `michizuri.github.io`
   - Proxy status: **DNS only** (grey cloud) – GitHub must see its own DNS to issue the HTTPS certificate
3. Wait for the DNS check in Settings → Pages to turn green (minutes, sometimes up to an hour), then tick **Enforce HTTPS**.
4. Push to `main` (or Actions → *test & deploy* → *Run workflow*).

Good to know:
- **Private repo ≠ private site.** Anyone with the URL can open the tool (it's marked `noindex`, so it won't show up in search). The tool holds no data – images are processed in the visitor's browser and never uploaded. If access must be restricted, put Cloudflare Access in front (needs the record switched to proxied/orange cloud).
- Domain takeover protection: verify `michizuri.com` once under your GitHub account → Settings → Pages → *Verified domains* (covers all subdomains; skip if already done for another project).
