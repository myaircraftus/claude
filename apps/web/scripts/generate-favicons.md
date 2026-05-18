# Generate raster favicons

The vector sources are committed:

- `public/favicon.svg` — 64×64 favicon used directly by modern browsers
- `public/favicon-source.svg` — 512×512 master artwork (white GA plane on navy `#1B2B5E`)

The following **binary** files cannot be hand-authored and must be generated
from `public/favicon-source.svg`:

| File | Size | Purpose |
|------|------|---------|
| `public/favicon.ico` | 16/32/48 multi-res | Legacy browser tab icon |
| `public/favicon-16x16.png` | 16×16 | Small tab icon |
| `public/favicon-32x32.png` | 32×32 | Standard tab icon |
| `public/apple-touch-icon.png` | 180×180 | iOS home screen |
| `public/android-chrome-192x192.png` | 192×192 | Android home screen |
| `public/android-chrome-512x512.png` | 512×512 | PWA splash / install |

## One-line generation (sharp + to-ico)

Run from `apps/web/`:

```sh
npx sharp-cli -i public/favicon-source.svg -o public --format png resize 16 16 --output favicon-16x16.png && npx sharp-cli -i public/favicon-source.svg -o public resize 32 32 --output favicon-32x32.png && npx sharp-cli -i public/favicon-source.svg -o public resize 180 180 --output apple-touch-icon.png && npx sharp-cli -i public/favicon-source.svg -o public resize 192 192 --output android-chrome-192x192.png && npx sharp-cli -i public/favicon-source.svg -o public resize 512 512 --output android-chrome-512x512.png && npx png-to-ico public/favicon-32x32.png > public/favicon.ico
```

## Alternative

Upload `public/favicon-source.svg` to <https://realfavicongenerator.net> and
drop the generated files into `public/`. The filenames above match its default
output and the `<link>` / `site.webmanifest` references already in the app.
