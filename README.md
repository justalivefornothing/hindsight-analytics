# Hindsight Analytics

Local-first product analytics that runs entirely in the browser: a from-scratch DOM session recorder and replayer, autocaptured events, a funnel builder, and a feature-flag panel — demonstrated on a bundled sample store.

No server and no third-party capture SDK. Events and DOM snapshots live in IndexedDB, and the whole suite ships as a single Vite app.

## Features

- **Session recorder** (`src/recorder`) — MutationObserver-based DOM recording with autocapture of clicks and inputs, CSS selector generation, input masking for privacy, and a snapshot/mirror layer. No capture library involved.
- **Session replayer** (`src/replayer`) — rebuilds the page from recorded deltas and plays it back on a scrubbable timeline.
- **Events and funnels** (`src/analytics`) — autocaptured and custom events, funnel builder with step conversion.
- **Feature flags** (`src/analytics/flags.ts`) — flag definitions and evaluation panel.
- **Sample store demo** (`src/demo`) — a bundled shop that generates seeded, reproducible traffic (`rng.ts`, `seed.ts`) so the analytics have realistic data out of the box.
- **Local-first storage** (`src/storage`) — IndexedDB via `idb`, with an identity layer and an event bus.

## Stack

React 19 · TypeScript · Vite · Tailwind CSS 4 · Zustand · idb · Vitest with fast-check property tests · oxlint

## Run

```bash
npm install
npm run dev        # dev server
npm test           # unit + property tests
npm run build      # type-check and build
npm run preview    # serve the production build
npm run bench      # micro-benchmarks (scripts/bench.ts)
```

## Layout

```
src/
  recorder/   DOM recording: autocapture, selectors, masking, snapshots
  replayer/   Timeline, delta application, page rebuild
  analytics/  Events, funnels, feature flags, seeded demo data
  storage/    IndexedDB repository, identity, event bus
  demo/       Bundled sample store used as the analytics demo
  app/        App shell and screens
```

## License

MIT
