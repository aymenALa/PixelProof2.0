# Image fixtures

Regenerate these files with:

```text
node scripts/generate-fixtures.mjs
```

The generator uses Node built-ins (`zlib` and `fs`) plus the already-pinned Playwright Chromium test dependency to create a valid JPEG. It creates a transparent PNG, a large-dimension PNG, a corrupt byte stream, a PNG with a `.jpg` name, and a 2×1 JPEG containing EXIF orientation plus GPS metadata. The fixtures are local test data; processing never makes network requests.
