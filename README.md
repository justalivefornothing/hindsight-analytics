# Hindsight Analytics

Local-first product analytics with a from-scratch DOM session recorder and replayer, autocaptured events, and funnels that never leave the browser.

## What’s here

- Session recorder / replayer built without third-party capture libraries
- Autocaptured events + custom events
- Funnel views and basic product analytics surface
- Everything stored locally (IndexedDB via `idb`)

## Stack

React 19 · Vite · TypeScript · Zustand · Tailwind · Vitest

## Run

```bash
npm install
npm run dev
npm test
npm run build
```

## Status

Working toward a polished local-first analytics suite. Core pieces are in place; the surface is still being tightened.

## License

MIT
