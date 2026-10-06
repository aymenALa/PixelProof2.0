# PixelProof Lab

PixelProof Lab is a self-contained browser laboratory for measuring what happens to an image when it is decoded, transformed, and encoded again.

It is designed around a simple question:

> When an image is processed, did the bytes, metadata, pixels, structure, or perceived appearance change—and by how much?

The project answers that question locally in the browser. The selected file is processed without an application backend, without a database server, and without a dependency on another repository. The application can run a declared pipeline inline or inside a Web Worker, produces a structured audit report, stores run history in IndexedDB, and exposes deterministic experiment tooling for repeatable comparisons.

## Why this project exists

Image conversion tools usually optimize for producing an output file. PixelProof Lab adds the missing measurement layer.

Two files may look similar while having different bytes, metadata, dimensions, compression characteristics, or color-channel behavior. Conversely, an operation that changes many pixels may preserve the important visual structure of the image. PixelProof therefore does not rely on one metric or on visual inspection alone. It records several complementary forms of evidence:

- cryptographic identity of the input and output bytes;
- container and metadata markers for JPEG, PNG, and WebP;
- exact pixel differences when the raster dimensions are compatible;
- PSNR and SSIM, in luma or per-channel mode;
- perceptual dHash and pHash distances;
- output dimensions, requested versus actual encoder type, and fallbacks;
- per-step duration and raster memory size;
- the browser user agent used for the run;
- the selected runner and complete pipeline specification in local history.

The result is not merely an image converter. It is an evidence-producing instrument for understanding image transformations.

## Added value

### 1. A complete audit trail instead of a single output

Every audit run produces a report with separate `input`, `output`, `comparison`, `timings`, and `rasterBytes` sections. This makes it possible to distinguish:

- byte changes from pixel changes;
- metadata changes from visual changes;
- lossy encoding from resizing or grayscale transformation;
- requested encoder behavior from the browser's actual supported output type;
- processing cost from image-quality effects.

### 2. A declared and validated pipeline model

Pipelines are represented as JSON-like `StepSpec` values. Every step declares its input and output stage:

```text
bytes -> raster -> bytes
```

The runner validates the complete wiring before executing the first step. Unknown steps, duplicate registrations, invalid options, incorrect stage transitions, and pipelines that do not end in bytes are rejected explicitly.

This turns an image operation into a reproducible specification instead of hidden control flow.

### 3. Local-first privacy and operational independence

The application processes files in the browser. The network tests verify that processing creates no external HTTP requests, works while the browser is offline, and does not contain common network-capable processing APIs such as `fetch`, `XMLHttpRequest`, `WebSocket`, `FormData`, `EventSource`, or `sendBeacon`.

The production preview also sends a restrictive Content Security Policy:

```text
default-src 'self'; connect-src 'none'; worker-src 'self' blob:; img-src 'self' blob: data:
```

This makes the privacy property testable and repeatable rather than a marketing claim.

### 4. Performance isolation without changing the processing model

`InlineRunner` and `WorkerRunner` share the same `runPipeline` implementation and the same step registry. Worker mode moves execution away from the main UI thread while preserving the same declared pipeline contract and report shape.

The worker protocol supports:

- unique run identifiers;
- result and error messages;
- cancellation through `AbortController`;
- cleanup of completed controllers;
- report transfer back to the UI.

The end-to-end suite also processes a 12-megapixel raster through `WorkerRunner`.

### 5. Reproducible experimentation

The experiment harness runs four parameterized pipelines over every local fixture, repeats each run, and rejects nondeterministic result fields. It records image-quality metrics, byte sizes, raster memory, and timing data in CSV form.

Timing is intentionally treated as a measurement rather than a deterministic identity. Quality and output fields must remain stable across repetitions.

## Project status and scope

This is a focused local laboratory, not a hosted image service. Its current scope is:

- browser-based image input and output;
- JPEG, PNG, and WebP signature validation;
- browser-supported decoding and encoding through `createImageBitmap`, `OffscreenCanvas`, and `convertToBlob`;
- a plugin-like registry of processing steps;
- local reports and local run history;
- testable offline and same-origin operation.

The application deliberately does not introduce a remote API, cloud storage, server-side image library, or external repository as part of its runtime design. Browser codec support still determines which output formats are actually available; the report records an encoder fallback when the browser returns a different type than requested.

## Repository structure

```text
.
├── index.html                     Browser entry document
├── package.json                   Scripts and pinned direct dependencies
├── vite.config.ts                 Vite build and production CSP configuration
├── playwright.config.ts           Production-preview E2E configuration
├── tsconfig*.json                 TypeScript project configuration
├── src/
│   ├── main.tsx                   React application bootstrap
│   ├── browser-entry.ts           Browser-testable public API
│   ├── core/
│   │   ├── types.ts               Payload, stage, step, context, and report contracts
│   │   ├── registry.ts             Step registration and factory lookup
│   │   ├── report.ts               Report creation, target validation, JSON serialization
│   │   ├── run.ts                  Pipeline validation, execution, cancellation, telemetry
│   │   ├── runner.ts               Runner abstraction and inline implementation
│   │   └── auditPipeline.ts         Preset pipeline construction
│   ├── steps/
│   │   ├── index.ts                 Built-in step registration side effects
│   │   ├── decode.ts                Magic-byte validation and raster decoding
│   │   ├── resize.ts                Aspect-preserving maximum-width resize
│   │   ├── grayscale.ts             Luma-based grayscale transformation
│   │   ├── encode.ts                PNG/JPEG/WebP encoding and JPEG flattening
│   │   ├── hash.ts                  SHA-256 input/output identity
│   │   ├── inspectMetadata.ts        JPEG/PNG/WebP container metadata inspection
│   │   ├── pixelDiff.ts              Exact raster difference metrics
│   │   ├── psnr.ts                  Peak signal-to-noise ratio step
│   │   ├── ssim.ts                  Structural similarity step
│   │   ├── dhash.ts                 Difference hash comparison
│   │   ├── phash.ts                 DCT-based perceptual hash comparison
│   │   └── measurement-utils.ts     Shared raster readers and metric algorithms
│   ├── worker/
│   │   ├── WorkerRunner.ts           Main-thread worker adapter
│   │   └── worker.ts                 Worker message loop and cancellation map
│   └── ui/
│       ├── App.tsx                  Upload, configuration, report, and history UI
│       ├── history.ts                IndexedDB persistence
│       └── styles.css                Local laboratory interface styling
├── tests/
│   └── fixtures/                    Generated and hand-crafted image fixtures
├── e2e/
│   ├── steps.spec.ts                Browser workflow and large-raster tests
│   └── network.spec.ts              Offline, no-request, CSP, and history tests
├── docs/
│   └── network-checks.md            Manual Chrome verification procedure
├── experiments/
│   └── README.md                    Experiment methodology
├── scripts/
│   ├── generate-fixtures.mjs        Deterministic fixture generator
│   └── run-experiments.mjs          Repeated browser experiment harness
└── experiments.csv                  Generated experiment results
```

## Architecture

The system is organized into six cooperating layers.

### Application layer

`src/main.tsx` mounts the React application. `src/ui/App.tsx` owns user-facing state:

- selected file;
- drag-and-drop state;
- inline versus Worker mode;
- pipeline preset and editable pipeline JSON;
- running and cancellation state;
- output preview and download name;
- current report;
- history sorting, export, and deletion.

The UI does not implement image algorithms itself. It selects a runner and passes a file plus a pipeline specification into the core execution layer.

### Runner layer

The `Runner` interface defines one operation:

```ts
run(input: Blob, specs: readonly StepSpec[], ctx: Ctx): Promise<Bytes>
```

`InlineRunner` invokes the core pipeline directly. `WorkerRunner` creates a module worker, sends the file and step specifications, listens for a matching run identifier, and merges the returned report into the caller's context.

Both runners intentionally share the same pipeline engine. This prevents worker mode and inline mode from becoming two separate implementations with different behavior.

### Pipeline engine

`runPipeline` performs four important jobs:

1. Resolve every `StepSpec` through the registry.
2. Validate stage compatibility before executing any step.
3. Execute steps in order while checking cancellation between steps.
4. Record step timing, raster memory, original pixels, user agent, and final output size.

The engine starts with a `Bytes` payload and requires the final payload to return to `Bytes`. Raster payloads are represented by `OffscreenCanvas` and byte payloads by `Blob`.

The first raster encountered is copied into `ctx.original`. Comparisons later in the pipeline therefore measure the transformed output against a detached original snapshot rather than against a mutated canvas.

### Registry and step layer

Each built-in step registers a factory under a unique string type. The registry provides:

- duplicate-type protection;
- explicit unknown-step errors;
- options passed into factories;
- a single discovery mechanism used by both inline and worker execution.

This keeps the engine generic. A step only needs to declare its name, input stage, output stage, and `run` function.

### Reporting layer

The report separates facts by purpose:

```text
input        SHA-256, metadata, input byte count
output       SHA-256, metadata, output byte count, encoding, resize
comparison   pixelDiff, PSNR, SSIM, pHash, dHash, metric errors
timings      milliseconds keyed by step name
rasterBytes  width × height × 4 keyed by raster-producing step
userAgent    browser identity for reproducibility context
```

Metric failures are recorded under `comparison.errors` where possible so one unsupported or incompatible comparison does not hide the rest of the report.

### Persistence layer

Run history is stored in the browser's IndexedDB database `pixelproof-local`, object store `runs`. A history entry contains the run identity, timestamp, input filename, runner, pipeline, input/output byte sizes, and report.

The UI can reload history, sort it, export it as CSV, and delete individual entries. The data remains local to the browser profile.

## The standard audit pipeline

`buildAuditPipeline` converts high-level options into a complete sequence of step specifications. For a standard run, the pipeline is:

```text
1.  hash(input)
2.  inspectMetadata(input)
3.  decode
4.  optional transform: grayscale OR resize
5.  encode(requested output type)
6.  hash(output)
7.  inspectMetadata(output)
8.  decode output
9.  pixelDiff
10. PSNR in channel mode
11. SSIM in channel mode
12. dHash comparison
13. pHash comparison
14. encode again for the final returned Blob
```

The second decode is intentional. It measures the raster that the browser actually reconstructed from the encoded output, not merely the in-memory raster before encoding. That is what makes the quality metrics relevant to the produced file.

### Phase 1: input identity

The input `Blob` is hashed with SHA-256. This provides a stable byte-level identifier for the source file and allows experiment output to distinguish an unchanged byte stream from a transformed one.

### Phase 2: input metadata inspection

The metadata step scans the original byte container without requiring a server-side parser. It identifies selected metadata families:

- JPEG APP1, APP2, and APP13 markers;
- JPEG EXIF GPS latitude and longitude when present;
- PNG `eXIf`, `iTXt`, `iCCP`, and `tEXt` chunks;
- WebP `EXIF`, `XMP `, and `ICCP` chunks.

The parser is defensive about container boundaries, byte order, TIFF offsets, and missing fields. It reports presence and supported values rather than claiming to preserve every possible metadata field.

### Phase 3: decoding and original capture

The decoder validates JPEG, PNG, or WebP magic bytes before calling `createImageBitmap`. This rejects mislabeled or corrupt input earlier and avoids sending clearly invalid content into the browser decoder.

The bitmap is drawn onto an `OffscreenCanvas`. The pipeline engine captures the first raster as the comparison baseline.

### Phase 4: optional transformation

The current presets support:

- no transform;
- grayscale using the luma coefficients `0.2126`, `0.7152`, and `0.0722`;
- aspect-preserving resize to a maximum width.

Resize records whether it was applied and records the original and resulting dimensions. Grayscale changes RGB channels while leaving alpha untouched.

### Phase 5: encoding

The encoder supports requested PNG, JPEG, and WebP output types through `OffscreenCanvas.convertToBlob`.

JPEG cannot represent transparency in the same way as the source raster, so the encoder first paints a configurable background, defaulting to white, then draws the raster over it. The report records the requested type, actual type, dimensions, and any browser fallback.

### Phase 6: output identity and metadata

The encoded output receives its own SHA-256 hash and metadata scan. Comparing input and output reports makes byte and container changes explicit.

### Phase 7: quality measurement

The output is decoded again and compared to the original snapshot:

- `pixelDiff` reports maximum absolute channel difference, changed-pixel count, and changed-pixel percentage;
- `PSNR` reports luma and, in channel mode, red/green/blue values;
- `SSIM` reports luma and optional per-channel structural similarity;
- `dHash` compares local horizontal brightness gradients;
- `pHash` downsamples to a 32×32 grayscale image, computes low-frequency DCT coefficients, thresholds them, and compares the resulting hash with Hamming distance.

Exact pixel metrics require equal raster dimensions. A resize may therefore produce a metric error instead of a misleading comparison; the rest of the report remains available.

### Phase 8: telemetry and result delivery

The runner records elapsed time per step and the memory footprint of each raster stage using `width × height × 4`. It returns the final `Blob` to the UI, which creates a preview URL and a format-appropriate download name.

## User workflow

1. Start the application.
2. Drop an image onto the upload area or select one from the file picker.
3. Choose Worker or Inline execution.
4. Choose a preset or edit the pipeline JSON.
5. Run the pipeline.
6. Inspect the output preview and report.
7. Download the output image if desired.
8. Review, sort, export, or delete the local run history.

The editable pipeline field makes the application useful as an exploration tool: a user can inspect the exact declared steps rather than choosing from opaque buttons only.

## Development phases represented by the repository

The codebase can be understood as a sequence of engineering phases.

### Phase A — establish a standalone browser foundation

The project begins with Vite, TypeScript, React, and browser-native APIs. The dependency set is intentionally small and pinned in `package.json`. There is no runtime server application and no cross-repository import.

Deliverable: a buildable browser application with a clear entry point and repeatable npm scripts.

### Phase B — define the domain contracts

`types.ts` defines the central vocabulary: bytes, raster, stages, payloads, contexts, reports, steps, and step specifications.

Deliverable: the rest of the application can share strong contracts instead of passing untyped image state between unrelated functions.

### Phase C — build a safe extensible pipeline engine

The registry and runner were separated from individual algorithms. The engine validates wiring, resolves factories, supports cancellation, captures the original raster, and records telemetry.

Deliverable: new steps can be added without rewriting orchestration, while invalid pipelines fail before partial execution.

### Phase D — implement the image transformation primitives

Decode, resize, grayscale, and encode provide the transformation path. Browser-native `OffscreenCanvas` keeps the implementation local and supports worker execution.

Deliverable: actual images can move from bytes to raster and back to bytes with explicit format and size behavior.

### Phase E — add forensic and perceptual evidence

Hashing, metadata scanning, pixel difference, PSNR, SSIM, dHash, and pHash extend the project from conversion into auditing.

Deliverable: a single run can explain not only that output changed, but what kind of change occurred.

### Phase F — make execution production-like

Worker mode, cancellation, error handling, object URL cleanup, local history, sorting, CSV export, and browser reload persistence make the laboratory usable beyond a unit-test harness.

Deliverable: users can run large images, inspect results, preserve evidence locally, and recover history after reload.

### Phase G — verify privacy and behavior end to end

Vitest covers contracts and metric algorithms. Playwright tests the built production preview, worker behavior, drag-and-drop, offline execution, no-request behavior, CSP headers, history persistence, export, and deletion.

Deliverable: important architectural claims are executable tests rather than undocumented intentions.

### Phase H — measure repeatability with experiments

The experiment script runs every fixture through four pipelines and repeats each case. It rejects nondeterministic result fields and writes a CSV suitable for inspection or later analysis.

Deliverable: the project can produce evidence about its own behavior across transformations and fixtures.

## Built-in pipeline presets

The UI currently exposes four presets:

| Preset | Transformation | Output | Purpose |
| --- | --- | --- | --- |
| `no-transform-png` | None | PNG | Baseline browser re-encode |
| `no-transform-jpeg` | None | JPEG, quality `0.92` | Lossy encoding comparison |
| `grayscale-png` | Luma grayscale | PNG | Color-to-luma transformation |
| `resize-2400-png` | Maximum width `2400` | PNG | Dimension and scaling comparison |

## Tests and verification strategy

### Unit and integration tests

The Vitest suites cover:

- invalid stage wiring;
- unknown steps;
- cancellation between steps;
- timing and raster memory recording;
- requirement that a pipeline ends in bytes;
- factory option forwarding;
- image magic validation before decoding;
- stable SHA-256 output for identical bytes;
- explicit input/output targets for byte-reporting steps;
- preservation of original pixels through transformations;
- duplicate registry protection;
- exact and inverted-image metric behavior;
- per-channel detection of changes that luma can hide;
- unequal-dimension rejection;
- Hamming edge cases;
- JPEG, PNG, and WebP metadata containers;
- EXIF/GPS extraction from a real fixture.

### Browser end-to-end tests

The Playwright tests run against the built production preview rather than only the development server. They verify:

- the default page and controls;
- Worker and Inline selection;
- processing and output preview;
- output download naming;
- report fields;
- drag-and-drop selection;
- a 12-megapixel Worker run;
- zero external requests after file selection;
- successful operation while offline;
- absence of forbidden network APIs in source;
- same-origin document and worker loading;
- production CSP headers;
- history persistence across reload;
- history sorting, CSV export, and deletion.

### Fixtures

Fixtures are generated locally and cover transparent PNG, RGB color data, large dimensions, EXIF/GPS JPEG, corrupt bytes, a PNG with a `.jpg` filename, and other deterministic cases. This deliberately tests both valid inputs and misleading or invalid input conditions.

## Experiments

Run the experiment harness with:

```bash
npm run experiments -- --runs=3 --out=experiments.csv
```

The harness starts a local Vite page, loads every fixture, runs the four standard pipelines through `InlineRunner`, and repeats each fixture/pipeline pair. It checks stable output fields and writes:

- fixture name;
- pipeline name;
- whether the SHA changed;
- pHash and dHash distances;
- maximum pixel difference;
- changed-pixel percentage;
- PSNR and SSIM;
- total measured step time;
- input and output bytes;
- raster memory;
- user agent.

Timing is recorded for observation but is not required to be identical across repetitions.

## Getting started

### Requirements

- Node.js with npm;
- a browser supported by Playwright for E2E tests;
- the dependencies installed from the committed lockfile.

### Install

```bash
npm install
```

### Start the development server

```bash
npm run dev
```

### Build the production bundle

```bash
npm run build
```

### Preview the production bundle

```bash
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
```

### Run checks

```bash
npm run typecheck
npm test
npm run lint
npm run e2e
```

The E2E command builds the project and starts its own production preview according to `playwright.config.ts`.

### Regenerate fixtures

```bash
node scripts/generate-fixtures.mjs
```

## Design decisions and their reasoning

### Browser-native image primitives

Using `Blob`, `createImageBitmap`, `OffscreenCanvas`, `ImageData`, `crypto.subtle`, IndexedDB, and Web Workers keeps the runtime self-contained and avoids a server-side image dependency. It also makes the privacy boundary easy to test.

### Explicit stages instead of implicit type assumptions

A byte payload and a raster payload have different valid operations. Encoding a byte payload or hashing a raster payload would be a category error. The `bytes` and `raster` stage contracts make those errors visible at pipeline validation time.

### Preserve the original before mutation

Transforms such as grayscale mutate raster content. Capturing the original snapshot before those changes prevents the comparison baseline from moving with the transformation.

### Use multiple metrics

No individual metric answers every image-quality question. SHA-256 is exact but visually blind; pixel difference is direct but dimension-sensitive; PSNR and SSIM summarize different aspects of error; perceptual hashes are compact similarity signals. The project keeps them together so users can compare evidence instead of trusting one number.

### Record browser fallbacks

Encoding is capability-dependent. A request for WebP or another format may not produce the exact requested MIME type in every browser. The report records both requested and actual types so the result cannot silently misrepresent what happened.

### Preserve errors inside the report where possible

Comparison metrics may be impossible after a resize because dimensions differ. Recording a metric-specific error keeps the report useful and distinguishes “not comparable” from “identical.”

## Security, privacy, and data handling

- Input files are handled in the browser.
- The application does not upload image contents.
- Run history is stored in the browser's IndexedDB, not in a remote database.
- Output preview URLs are revoked when replaced or unmounted.
- Worker cancellation is connected to the current run's `AbortController`.
- The production preview applies a restrictive CSP.
- Network behavior is covered by automated and manual checks.

Local browser storage is still user data. Clearing site data removes the saved run history. The application does not currently provide an encrypted export or cross-device synchronization mechanism.

## Known boundaries

The project is intentionally honest about what it measures:

- It inspects selected metadata markers; it is not a complete metadata-preservation specification for every image format field.
- Exact pixel comparison requires equal dimensions.
- Browser codec availability can produce an encoder fallback.
- Timing varies with browser, hardware, and execution conditions.
- Perceptual metrics are implementation-level indicators, not a universal perceptual-quality score.
- The UI is local-first and does not provide multi-user collaboration or remote job execution.

These boundaries are surfaced in reports, errors, tests, or documentation rather than hidden.

## A concise mental model

```text
User selects image
        │
        ▼
Step specifications are built or edited
        │
        ▼
InlineRunner or WorkerRunner
        │
        ▼
Registry resolves each step
        │
        ▼
bytes ──decode──> raster ──transform──> raster ──encode──> bytes
  │                                                     │
  ├── hash + metadata                                   ├── hash + metadata
  └──────────────────── comparison metrics ─────────────┘
        │
        ▼
Structured report + preview + local history
```

## Final perspective

The effort invested in PixelProof Lab is visible in the separation of concerns and in the verification surface around the core idea. The project does not stop at implementing image operations. It defines contracts, validates pipeline wiring, isolates heavy work, captures a comparison baseline, measures several kinds of change, records resource behavior, persists evidence locally, tests offline guarantees, and provides a repeatable experiment path.

That combination is the project's main contribution: a standalone, inspectable, privacy-preserving way to turn image processing into a measurable audit rather than an opaque conversion.
