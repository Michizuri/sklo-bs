# samples/ — real jobs, local only

Everything in this folder except this README is **gitignored**. Put real client files here (Shutterstock motifs, SketchUp drawings, reference results); they are tested locally and never pushed.

One folder per job:

```
samples/
  kuchyn-orchidej/
    1_zamereni.png      ← drawing   (file starting with "1_", or named drawing.*)
    2_motiv.jpg         ← motif     (file starting with "2_", or named motif.*)
    3_vysledek.jpg      ← optional reference result, only for your eyes
    case.json           ← expected values (optional, see below)
```

Run `npm run samples` (only samples) or `npm test` (synthetic fixtures + samples).
For every job the runner saves a screenshot of the app plus the exported files to `tests/output/samples/<job>/`.

## case.json

Without `case.json` the runner only checks that the drawing loads, then writes a template `case.json` with one `[null, null]` entry per detected panel. Fill in the real sizes and run again.

```json
{
  "panels": [[2008, 548], [1474, 548]],
  "cutouts": [
    [[178, 238, 140, 65], [1748, 238, 140, 65]],
    [[136, 227, 140, 65]]
  ],
  "toleranceMm": 3,
  "fit": "fill",
  "dpi": 150,
  "export": true
}
```

| Key | Meaning |
|---|---|
| `panels` | Required. `[width, height]` in mm per panel, left to right, as on the glass order. |
| `cutouts` | Optional. Per panel a list of `[left, bottom, width, height]` mm: left edge from the panel's left edge, bottom edge from the panel's bottom edge. |
| `toleranceMm` | Optional, default 3. Allowed difference for cutout positions. |
| `fit` | Optional: `fill`, `stretch` or `tile`. Default `fill`. |
| `dpi` | Optional print DPI. Default 150. |
| `gap` | Optional gap between panels in mm. Default 0. |
| `sliders` | Optional slider values, e.g. `{"posY": 85, "zoom": 120}` (ids: `zoom`, `cropH`, `posX`, `posY`). |
| `tileH` | Optional tile height in mm (tile mode). |
| `export` | Optional, default `true`. Exports the files and checks PNG sizes and DPI. |

What gets checked: number of panels, typed sizes match the drawing proportions, cutout positions (if given), no errors in the app, exported PNG sizes and DPI.
