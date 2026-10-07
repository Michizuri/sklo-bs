# Sklo – sesazení motivu

Browser tool that places a motif (Shutterstock image, pattern, preview) onto kitchen glass panels using the SketchUp measurement drawing, and exports print-ready PNGs plus a control preview with magenta cutouts.

**The whole app is `index.html`.** No install, no Python, no build step. Everything runs locally in the browser; images never leave the computer.

---

## Návod (pro zákazníka)

1. Otevřete odkaz na aplikaci (nebo dvakrát klikněte na `index.html`). Doporučený prohlížeč: **Chrome nebo Edge**.
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
- Version: bump `VERSION` in `index.html`, commit, tag (`git tag v0.2.0`).

### Tests (optional, needs Node.js)

```bash
npm install
npx playwright install chromium
npm test
```

Runs the app headlessly against synthetic drawings in `tests/fixtures/` (3 panels in two rows, different heights, grey and white background, dimension lines crossing panels) and checks panel order, cutout positions, size validation and exported PNG sizes/DPI. GitHub Actions runs the same on every push.

**Don't commit client files** (Shutterstock motifs, real drawings) if the repo is public – add them to `tests/fixtures/private/` (git-ignored) for local testing.

### Hosting

Any static hosting works – it's one HTML file:

- **GitHub Pages**: repo → Settings → Pages → *Deploy from branch* → `main` / root. Every push updates the live version. (Pages on a private repo needs a paid GitHub plan.)
- Or upload `index.html` to any web server, or just send the file – it works offline from disk.
