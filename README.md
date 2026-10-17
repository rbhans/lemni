# Lemscape

The endless canvas for buildings: a project's documents (control drawings, floor plans,
specs), live operator graphics, trends and tables, linked together and connected to the
building systems behind them (Niagara today). Use your own AI app (Claude Code, Claude
Desktop, Codex) on it over MCP. Formerly Lemni, and BAS Board before that; v2 of `bas-whiteboard`, rebuilt from
scratch.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3000. The board is saved in the browser (IndexedDB) for now.

### Live data without a station

```bash
npm run sim
```

starts a simulated Niagara station (baskStream API) at http://127.0.0.1:8710 with an
AHU, five VAVs, a meter, history and alarms. Open the Station panel and connect; the
login is printed by the simulator and set in `scripts/sim-station.mjs`.

The baskStream SDK is vendored in `vendor/baskstream-sdk` until it is published;
`npm run vendor:baskstream` refreshes it from github.com/rbhans/bask-stream.

```bash
npm run symbols:sync   # pull ../../symbol-library/svg and rebuild the HVAC library
npm run check          # typecheck, lint, unit tests
npm run build          # production build
```

## Layout

| Path | What lives there |
| --- | --- |
| `app/` | Next.js entry, fonts, theme, global CSS |
| `components/ui/` | shadcn components (preset `b1tMLkcts`, Base UI) |
| `studio/` | The app shell: editor mount, plugin runtime, docks, menus, Inspector |
| `plugins/` | Built-in plugins: canvas core, pen & shapes, HVAC symbols, UI elements, Niagara, Metasys SCT archive, previews |
| `server/` | Server-only helpers shared by plugin APIs (request guard) |
| `vendor/` | Vendored baskStream SDK |
| `scripts/` | Simulated station, SDK refresh, symbol library build |
| `docs/` | Architecture, roadmap, v1 and baskStream reference notes |

Start with [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and
[docs/ROADMAP.md](docs/ROADMAP.md).

## Licensing

The canvas engine is the tldraw SDK. Local development needs no key and shows a
watermark; production needs a tldraw license key in `NEXT_PUBLIC_TLDRAW_LICENSE_KEY`.
