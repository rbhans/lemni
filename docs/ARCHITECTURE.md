# Lemni architecture

Lemni is the endless canvas for buildings: a hub for a project's documents (control
drawings, floor plans, specs), operator graphics with live data, trends and tables, and
the building systems it connects to (Niagara today), with AI apps working alongside.
It isn't a building automation system itself; it connects to them. The name comes from
the lemniscate, the ∞ curve in the logo. It was called BAS Board while in development;
saved boards, settings and the local data folder from then carry over (see
Persistence). It is v2 of `bas-whiteboard` (basdraw),
rebuilt from scratch. The v1 concepts it carries forward are summarized in
[`reference/v1-behaviors.md`](reference/v1-behaviors.md) and
[`reference/v1-platform.md`](reference/v1-platform.md).

UI design: the "BAS Board UI" design canvas (Canvas/Design, Behaviors + Station, AI
workspace, Plugin manager). The app follows it; where they differ, the design wins
unless the engine makes it impractical, in which case this document says so. (The AI
workspace was replaced by the MCP connection; see AI.)

## Principles

1. **Our UI, tldraw's engine.** tldraw 5 provides the canvas, shapes, tools, undo,
   clipboard and persistence. Every visible control is shadcn (Base UI). No tldraw UI
   component is rendered.
2. **Everything is a plugin.** Core features use the same contribution points as
   optional ones. Turning a plugin off never deletes content.
3. **Saved drawing is intent; live data is input; presentation is disposable.**
   Behaviors never write animated values back into the document (v1 rule, kept).
4. **Least privilege by default.** Station writes and AI actions are opt-in, previewed,
   approved per action and audited (v1 write pipeline, kept).

## Stack

| Layer | Choice |
| --- | --- |
| App | Next.js 16 (App Router, Turbopack), React 19 |
| UI | shadcn preset `b1tMLkcts`: `base-mira` style (Base UI primitives), stone neutrals, lime accent, Space Grotesk + Geist Mono, Hugeicons |
| Canvas | tldraw 5.4 `TldrawEditor` ("exploded" setup) |
| State | tldraw signals (`atom`, `useValue`) for studio state as well as the editor |
| Tests | `node --test` on pure modules (Node 26 strips types natively) |

Next 16 differs from older versions; read `node_modules/next/dist/docs/` before using
unfamiliar APIs (see `AGENTS.md`).

## How the canvas is mounted

`studio/editor/board-editor.tsx`

- `TldrawEditor` gets the default shape utils, tools, binding/asset/overlay utils, a
  board theme and the persistence key. Shapes and tools come from **all** plugins,
  enabled or not, so any saved board loads.
- Its children replace tldraw's default canvas. Inside we render tldraw's `Canvas`
  ourselves, wrapped in our shadcn context menu.
- `TldrawUiContextProvider` is mounted **without** `TldrawUi`. That gives us tldraw's
  action and tool registries, keyboard shortcuts, clipboard handling and translations
  with none of its visuals. Our menus call `useActions()`/`useTools()` directly.
- `EngineBridge` does what `<Tldraw>` does on mount: shortcuts, native clipboard,
  default external-content handlers (drops, pastes), store side effects. It also
  bridges tldraw toasts to sonner, syncs light/dark from `next-themes`, and runs each
  enabled plugin's `onEditorMount`.
- Tools owned by a disabled plugin are removed through a `TLUiOverrides.tools`
  override, which also removes their shortcuts.
- The studio chrome is rendered **inside** the editor's React tree (so it shares every
  context) and portaled into the shell's docked slots. The canvas cell uses
  `isolation: isolate` so tldraw's z-indexes stay below menus and dialogs.
- `board-theme.ts`: tldraw 5 draws selection, brush and snap lines on a 2D canvas from
  its theme object, so the preset accent is set there as well as in CSS variables.

Known engine constraints: tldraw's built-in shapes use its discrete style system
(13 named colors, fill/dash/size presets). Free hex colors, gradients and per-point
ports need our own shape utils (planned for the symbol and widget shapes).

## Shell

`studio/shell/*` — a CSS grid of slots:

```
┌──────────── top bar: brand · menubar · page menu · workspace · plugin items · theme · export ┐
│ rail │ left dock │            canvas + floating tool dock            │ right dock │
└──────────── status bar: page · selection · cursor … plugin items … grid/snap · zoom ────────┘
```

- **Workspaces** are layouts contributed by plugins: which left panel opens by default
  and what fills the right dock. `canvas` (core) uses the Inspector. The switcher hides
  while only one workspace exists (the AI workspace went away with the move to MCP;
  see AI below).
- **Inspector** (right): selection header, tabs (Design, Behavior, Data, …) and ordered
  sections, Illustrator style. Sections declare `when(editor)` and render only when
  relevant. The panel itself is there only while something can be edited: a selection,
  or a section that applies without one (the next shape's style while a drawing tool is
  active, a wire picked on the wire sheet). It slides in and out (hiding waits a moment,
  so click-then-drag selection doesn't flicker), the canvas takes the space back, and
  when it slides over what was just selected the view moves that out from under it.
  View → Properties panel still turns it off entirely.
- **Tool dock**: tldraw-style bottom toolbar built from toolbar contributions, grouped
  navigate / draw / insert / present, with split buttons for variants (shapes).
- **Library** (left): one panel; plugins contribute collections to tabs (HVAC, Images, …).
  Basic shapes are not in the Library; they live in the tool dock's Shapes button. Click inserts at view center; drag inserts at the drop point.
- **Layers** (left): pages (add, rename, duplicate, reorder, delete) above the current
  page's layers (rename, hide/show, lock). Names live in `meta.name` (frames keep their
  own `props.name`); hidden shapes have `meta.hidden: true` and are skipped by tldraw's
  `getShapeVisibility`, so they keep their place but aren't drawn or selectable.
  tldraw merges `meta` key by key, so clearing writes `null`/`false` rather than
  dropping the key (`studio/lib/shape-names.ts`).
- **Command palette** (⌘K): every menu item, plugin command, tool, panel, workspace,
  page, layer on the current page and Library insert, in one list with word-aware
  matching (`studio/lib/palette-score.ts`). File → Open recent reuses it in a
  recent-boards-only mode.
- **Shortcut sheet** (?): built from the same sources, so a plugin's shortcuts show up
  as soon as it is enabled.
- **Hotkeys** (`use-studio-hotkeys.ts`, `studio/lib/hotkeys.ts`): menu items with their
  own `onSelect` and plugin commands bind their `kbd` here; items that point at a
  tldraw action are bound by tldraw. Shortcuts use the menu notation (`cmd+shift+s`,
  `shift+/`); `cmd` is ⌘ on a Mac and Ctrl elsewhere. Plain-key shortcuts never fire
  while typing.

## Plugins

`studio/plugins/*`, built-ins in `plugins/*`.

A plugin is a typed descriptor (`BoardPlugin`). Contribution points:

| Point | Purpose |
| --- | --- |
| `shapeUtils`, `bindingUtils`, `tools` | Engine registrations (always registered) |
| `ownsTldrawTools` | tldraw tools hidden (with shortcuts) when the plugin is off |
| `toolbar` | Tool dock items; tldraw tool ids or custom `onSelect` |
| `panels` | Left/right dock panels per workspace |
| `inspectorTabs`, `inspectorSections` | Properties panel tabs and sections |
| `menuItems` | Menubar entries (tldraw action ids or callbacks) |
| `pointDrops` | Points dropped on the canvas: claim a shape (`target` + `drop`) or offer to `create` something on empty canvas |
| `pageCategories` | Page categories a plugin brings (the wire sheet); `kind` decides tools and panels |
| `contextMenuItems` | Canvas right-click entries (shown above the standard ones) |
| `pasteOptions` | What a pasted shape can carry: `strip` for plain paste, `capture` / `restore` for Paste special |
| `fileImporters` | Files dropped or added (PDF, Word, sheets); the rest go to tldraw's default handling |
| `ai` | Tools, a short guide and shape descriptions for AI apps connected over MCP (see AI) |
| `commands` | Command palette entries (and their shortcuts) that aren't in a menu |
| `topbarItems`, `statusItems`, `canvasOverlays` | Small UI slots |
| `shapeDecorators` | Wrap every shape's rendered content (runtime effects) |
| `canvasLayers` | Page-space layers that pan and zoom with the board (value labels) |
| `workspaces` | Layouts |
| `libraryCollections` | Library tiles |
| `providers`, `onEditorMount` | React providers and editor lifecycle hooks |

Rules (carried from v1, where they worked):

- **Installed vs enabled.** Engine pieces are always registered; enablement only gates
  UI, runtime and AI exposure.
- **Dependencies.** `dependencies` are required and resolved transitively: turning a
  plugin on turns on what it needs; turning it off turns off what needs it.
  `optionalDependencies` must degrade gracefully.
- **Only explicit choices are stored** (`lemni.plugins.v1`), so new defaults apply
  without migrations.
- **Stages.** `preview` plugins are usable but incomplete; `planned` ones are listed so
  the manager shows the roadmap but cannot be enabled.
- **Isolation.** Every contribution renders inside a `PluginBoundary`.
- **Tests.** `registry.test.ts` validates the graph and checks every enable/disable
  combination resolves to a dependency-safe set.

Planned: data-source contributions, settings pages, and loading third-party plugins.

## Behaviors

Implemented in `plugins/behaviors` (v1 notes:
[`reference/v1-behaviors.md`](reference/v1-behaviors.md)). v1 had eight point-driven
effects plus navigation, a sound runtime, and a monolithic editor. v2 keeps the runtime
principles and replaces the authoring model with a **registry of effects** and a **rule
card** per behavior:

```
Behavior = WHEN  source point + optional conditions (other points, all must hold)
           DO    effect (from the registry) with its mapping (switch | range | states | value)
           AND   transition (ramp time; continuous motion eases to rest)
```

Layout:

| Folder | Contents |
| --- | --- |
| `core/` | Pure, tested: model and parsing (`model.ts`), evaluation (`evaluate.ts`), the effect registry (`effects.ts`), composition into a presentation (`presentation.ts`) |
| `runtime/` | Signals for live-effects, drafts and test values; reading/writing `shape.meta.behaviors`; point drop; Present mode |
| `components/` | The shape decorator (CSS/WAAPI render adapters), the page-space labels layer, the Live effects / Present overlay |
| `ui/` | Behavior tab: list, rule-card editor, effect chooser, test control (the point picker is shared: `studio/data/point-field.tsx`) |

- **Storage.** `shape.meta.behaviors` holds versioned entries (`v: 1`); unknown entries
  survive a round trip so newer files open safely in older builds.
- **Effects** (`effects.ts`) register id, family, channel, output kind, defaults per
  source kind, validation and a pure `apply`. Built in: value label, color, level fill,
  visibility, opacity, blink, rotate (follow or spin, with pivot), move (follow or
  travel, per axis), scale, pipe flow, and On click: go to (page or frame). Number
  parameters can be bound to a point (spin speed from a VFD, for example).
- **Any point, any effect.** Mappings fit the point you give them: a number drives an
  on/off effect through a visible threshold ("is above 0", editable), and number effects
  map either through a Range or a table of Values, so an on/off or multistate point can
  drive a position or level ("On → 100 %, Off → 0 %", "Occupied → 80"). Table outputs are
  stored as text and read as numbers when the effect wants numbers.
- **Composition.** A shape and its ancestor groups are owners. For each channel the
  nearest enabled owner wins; transforms from group owners compose around the shape's
  own. Problems (no value yet, unmapped state, conflicts) are reported on the card
  instead of failing silently.
- **Rendering never writes to the document.** The decorator wraps the shape's content in
  layers: transform/opacity with a CSS transition, spin (WAAPI with playback-rate ramps),
  travel and blink (WAAPI), tints via CSS variables, image recolor via an alpha mask,
  level fill clipped to the shape's outline (or the image's alpha). Value labels render
  in page space above all shapes. tldraw's animation-speed preference (0) disables motion.
- **Authoring.** Dropping a point from the Station panel onto a shape opens the effect
  chooser with defaults for that point kind (a `pointDrops` contribution that runs
  last, so charts and tables take drops onto themselves first). Edits are drafts that preview live on the
  canvas; Save writes one undoable change. Test values (Live / chosen value) drive
  previews without touching the station.
- **Present mode** hides the chrome and grid, makes the board read-only with the hand
  tool, shows a pointer over clickable shapes and runs On click behaviors; Escape leaves.

**Shape states.** Shapes can expose named states (`studio/editor/shape-states.ts`): a
shape util implements `getShapeStates`, and the decorator hands runtime values to the
shape through `ShapeStateContext`. The Symbol state effect (offered only for shapes with
states) uses this to drive a symbol's own look, so a fan's rotor spins rather than the
whole drawing. Different states are different channels.

Not yet: multi-selection editing, presets with point-role remapping,
open-view and write-point interactions (those wait for write approvals in the AI phase).

## Symbols

`plugins/hvac-symbols` holds the base control-drawing library (the Plate-style pieces from
`../symbol-library`) as a native `bas-symbol` shape.

- **Source and build.** The SVGs are copied into `plugins/hvac-symbols/svg/` (their README
  documents the classes and variables) and compiled by `scripts/build-symbols.mjs` into
  `library.generated.ts`. `npm run symbols:sync` pulls a new copy of the library and
  rebuilds; `npm run symbols:build` rebuilds from the in-repo copy. The build fails on
  anything unexpected (scripts, links, ids, a viewBox not at 0 0, unscoped CSS).
- **Scoping.** Inline SVG styles are global, so each piece's CSS is rewritten under its
  own root class (`nx-air-damper`) and its keyframes are renamed. Each piece's sheet is
  injected into `<head>` once, however many copies are on the board.
- **State** lives in shape props (on, ccw, flow, parallel, loaded, position, level, sash,
  text) and becomes root classes and CSS variables (`--blade`, `--level`, `--sash`) only
  for features the piece has. The markup itself only changes with length or text, so the
  pieces' own transitions and animations run when state changes. Numbers are percentages
  (a damper's position is % open and becomes the blade angle).
- **Runs** (duct, pipe) stretch along x: their geometry is a template with the run
  length, so thickness and flow dashes keep their size.
- **Theme and flips.** `dk` follows the editor's color mode. Flips mirror the drawing and
  counter-flip `.label` groups so text stays readable. SVG export embeds the styles.

## Live data

Implemented in `plugins/niagara-baskstream` (see
[`reference/baskstream-sdk.md`](reference/baskstream-sdk.md) for the SDK itself).

- **The SDK runs on the server.** It is Node-only (SCRAM login, cookies, TLS options,
  `ws`), so `plugins/niagara-baskstream/server/hub.ts` keeps a process-wide hub (on
  `globalThis`, so it survives hot reloads) with one `BaskStreamClient` per station.
  The password lives only in that client's reconnect callback, in server memory.
- **One watch per connection.** Each browser tab (a random session id) declares the
  points it needs; the hub watches the union with one leased group. A tab's points are
  kept 30 s after its stream drops so reloads don't thrash subscriptions.
- **API.** `app/api/stations/[[...path]]` delegates to the plugin's handler. Everything
  is guarded by `server/request-guard.ts`: loopback hosts only (override with
  `LEMNI_ALLOWED_HOSTS`), same-origin, JSON bodies. Live values stream over
  server-sent events, batched every 100 ms.
- **Provider-neutral values.** `studio/data/live-points.ts` defines `DataSource`,
  `PointRef` (`{ source, point }`), `useLivePoint` and `useLiveValues`. Sources are
  keyed by a stable id (`niagara:<station origin>`) so drawings can store point
  references. Behaviors and widgets use this API, never baskStream directly.
- **History.** `DataSource.history(point, { start, end, buckets })` returns rollup
  buckets (avg/min/max; booleans as 0–1). `studio/data/history.ts` shares requests:
  the window end snaps to the refresh period, so every chart showing the same point
  and range reuses one request. Niagara clamps a window to 31 days and 10–600 buckets
  of at least a minute.
- **Point drops.** The Station tree drags `application/x-lemni-point` for a point
  and `application/x-lemni-folder` for a folder; a folder is expanded on drop with
  `DataSource.pointsUnder` (breadth-first, a few levels, at most 300 points).
  `studio/editor/point-drop.tsx` routes the points to the first `pointDrops`
  contribution that claims the shape under the pointer (outlining it while dragging);
  contributions without `multiple` are skipped for folders. On empty canvas it runs the
  only `create` option or shows a menu of them.
- **Writes** (next): capabilities check, `describe_write` preview, a one-time approval
  bound to the exact arguments, an audit row before dispatch, no automatic retries
  (v1 pipeline). Model edits use baskStream's preview/apply plans.

## Data widgets

`plugins/charts` and `plugins/tables`. Both are HTML shapes styled with the shadcn
tokens, take points by drop or from their Inspector section, and export through
tldraw's `foreignObject.tl-export-embed-styles` path (the same component renders,
then tldraw inlines its computed styles; `useDelaySvgExport` waits for history).

- **Trend chart** (`bas-chart`, Recharts via the shadcn chart setup). Numbers are
  grouped by unit into stacked panes that share one time axis, so a plot never has two
  value scales; on/off points become lanes. Up to eight series; each keeps its
  categorical color slot (`charts.css`, light and dark steps checked for color-blind
  separation), so removing one never repaints the rest. History buckets are plotted at
  their centers with a min–max band for a lone series, live values extend the line to
  "now", and one crosshair readout lists every series. Ticks are computed (round
  steps; % panes fixed at 0–100) and props passed to Recharts are kept referentially
  stable, because changing axis props every render makes it loop. Pure logic and tests:
  `model.ts`.
- **Stat tile** (`bas-stat`) and **gauge** (`bas-gauge`, dial or bar): one point each.
  The tile shows the value, its change since the start of the window and a sparkline
  whose latest stretch is in the accent (on/off points: share of time on). The gauge
  fills in the accent, amber past a warning limit and red past an alarm limit, always
  with an icon and a label. A gauge's first point sets a starting scale (0–100 for %,
  a band around temperatures). Pure logic: `value-model.ts`.
- **Units.** Points can join before their first live value, so their units may be
  empty; charts group and label by the live value's units until then.
- **Live table** (`bas-table`, TanStack Table on the shadcn table). "List" shows one
  point per row (equipment, value, status, updated); "By equipment" pivots point names
  into columns, one row per unit, and is chosen automatically when several units share
  point names. Equipment comes from the ORD (the folder holding `points`). A dropped
  folder is split into kinds of equipment (units whose point names mostly match) and
  each kind gets its own table, so an AHU doesn't widen the VAV table. Sorting is
  saved on the shape and set by clicking a header while the table is selected; missing
  values sort last. Rows that don't fit are counted, never scrolled (scrolling would
  fight canvas panning). CSV export prefixes formula characters, since point names come
  from the station.

## Project model

Details and decisions: [`PROJECT-MODEL.md`](PROJECT-MODEL.md).

- **Page categories** (`studio/pages/*`). A page's `meta` holds its `category` and
  `kind` (`ui`, `documents`, `wiresheet`; pages without one are UI). Built-in
  categories come from plugins (`pageCategories`), custom ones from the board's
  document meta. Tools and Library collections declare `pageKinds`, inspector tabs a
  `when`, so each kind gets the right tools; Present mode only shows UI pages; point
  drops only work on UI pages.
- **Document meta is written with `writeDocumentMeta`**: tldraw's
  `updateDocumentSettings` skips undo history, which would make links and categories
  impossible to undo.
- **Links** (`studio/links/*`, UI in `plugins/links`). Undirected links with a comment
  between frames, document cards (or one of their pages), pages and station items,
  stored in document meta. Any plugin can make a shape type linkable
  (`registerLinkable`, with `showPage` / `pageLabel` for paged shapes). An after-delete
  side effect drops the links of deleted shapes and pages in the same change.
- **Wire sheet**: one `bas-link-node` box per linked thing on the wire sheet page, kept
  in step with the links by a store listener (not an undo step); wires and the hover
  comment are a page-space layer under the boxes; a box's connector drags out a link.
  Layout is columns by category with barycenter ordering (`plugins/links/layout.ts`).
- **Paste** (`studio/editor/paste.tsx`): the "tldraw" paste handler applies every
  option's `strip`; copies are also remembered in memory so Paste special can paste them
  again with chosen options and remap captured data (e.g. links) to the new ids.
- **Documents** (`plugins/media-import`): files are stored as board assets (data URLs,
  so a board stays one file). PDFs render a page at a time with pdf.js (loaded on
  demand, pages cached as images); Word files convert with mammoth and are sanitized
  (no scripts, handlers, or non-web links); sheets parse with read-excel-file or a
  small CSV parser and keep up to 2,000 rows.

## Web view

`plugins/web-view`: a `bas-web` shape holding an iframe. While arranging, the page is
inert (pointer events off) so clicks select and move the shape; double-click enters
tldraw's editing state and hands the pointer to the page, and Present mode keeps it
live. The iframe is sandboxed without `allow-top-navigation`, so a page can't navigate
the board away. Addresses must be http(s), may not contain a login (it would be saved
in the board), and can't be the board itself.

Sites decide whether they may be framed (`X-Frame-Options`, CSP `frame-ancestors`),
and browsers don't tell the embedding page why a frame is blank. So
`/api/web-view/check` (guarded like the station API) reads just those headers from the
local server and the shape explains a refusal instead of showing a blank frame. It
skips certificate checks because it only reads two headers and stations often use
self-signed certificates; the iframe itself still needs the certificate accepted in the
browser. Cookies set inside the frame are third-party cookies and may be blocked by
the browser, which can stop a login from sticking; a desktop shell would avoid both
limits.

## AI

Decided October 2026: **no chat in the board and no API key in the app.** People use
the AI app they already pay for (Claude Code, Claude Desktop, Codex) and connect it to
the board over **MCP**; the board, open in a browser (Claude Code's browser pane works
well), is where they watch it work. Anthropic doesn't allow apps to offer Claude.ai
login or spend Pro/Max plans for their users, and ChatGPT plan sign-in is partner-only,
so MCP into the person's own app is the way to use an existing subscription. A built-in
panel with an API key could come later as a plugin for people without an AI app
(operators, deployed boards).

```
AI app ──MCP (Streamable HTTP, Bearer token)──▶ /api/mcp ─┐   plugins/assistant/server/*
                                                          │   bridge (globalThis)
board tab ◀──SSE: tool calls── /api/ai/bridge ◀───────────┘
board tab ──POST: tool list, results, focus──▶ /api/ai/bridge
```

Where things live: each plugin's tools in `plugins/<id>/ai-tools.ts`; the connection
(MCP endpoint, bridge, access levels, approvals, panel) in `plugins/assistant`; the
canvas shape format in `plugins/canvas-core/ai-shapes.ts`. Only what several plugins
share sits in `studio/ai`: the input schema and checks (`schema.ts`), point and page
helpers, and `safeBatch`.

- **Tools come from plugins** (`ai` contribution: `tools`, `guide`, `shapes`). A tool
  has a snake_case name, a description written for the AI, a JSON Schema input (the
  subset in `studio/ai/schema.ts`, checked before the tool runs), and an access kind:
  `read`, `edit` (changes the board) or `write` (changes an outside system). `shapes`
  describers add plugin fields to how shapes read (`"*"` for every shape; canvas core's
  is the common summary). Today: canvas (read_page, screenshot, create/update/delete/
  arrange shapes, pages, library), HVAC library (list_symbols, place_symbols,
  connect_ports, place_run, check_layout), links, behaviors, charts, tables, documents
  (read, zoom into and search PDF/Word/sheet text), web view, and the Niagara station
  (find/read/history/alarms, write_points, acknowledge_alarms), plus `board_overview`
  from the AI connection plugin.
- **Errors can't crash the board.** tldraw treats anything thrown inside an edit batch
  as fatal, so the connection runs each tool's synchronous part inside `safeBatch`
  (catch inside, rethrow outside). Tools that change the board after an `await` wrap
  those changes in `safeBatch` themselves, and tools check their input fully before
  changing anything.
- **The HVAC library is described for agents** (`plugins/hvac-symbols/manifest.ts`):
  each piece's purpose, ports (where ducts and pipes connect, which way, duct or
  pipe), and point roles with the behaviors that bind them. States are already plain
  percentages. `ports.ts` places ports through size, flips and quarter turns; tests
  check every piece is described and ports sit inside the drawing. `place_run` lays a
  whole air or water path on one centerline (boxes on the 10 px grid, room left for
  sensors, one continuous line behind); `check_layout` reports overlaps, loose ports,
  pieces clipped by their frame, unbound equipment and off-grid pieces. The source of
  this data is the plugin for now; if the symbol library gets its own manifest, the
  symbol build should import it.
- **Tools run in the board tab** that was used last, through the same code as the UI,
  so plugins, undo and live data behave the same. The server only relays; a closed or
  reloading board answers "Lemni isn't open". `board_status` is served by the server
  itself.
- **Access level** (AI panel, kept per browser): Off, Read only, Edit the board
  (default), Edit + station writes. Tools the level doesn't allow aren't listed, and are
  refused if called; changing the level sends `tools/list_changed`.
- **Board edits** happen live: each call starts an undo step, changed shapes are outlined
  for a moment and (with Follow on) brought into view. Present mode blocks edits.
- **Writes** (`access: "write"`) `prepare` a plan (each item, current → new value, the
  AI's reason, warnings, risk) that the board shows in an approval dialog. Nothing is
  sent unless the person chooses **Allow once** and then confirms an "Are you sure?"
  step (its button arms after a moment, so a double click can't pass both); Deny,
  closing the dialog, the AI app cancelling, or 4 minutes passing all decline. Approved station writes are logged to
  `.lemni/audit.log` before they're sent (no log, no write), sent once, never
  retried, read back after 250 ms and logged with their outcome. The station API only
  accepts writes marked confirmed and validates every item again.
- **Security.** `/api/mcp` answers local addresses only, rejects browser origins other
  than its own, and requires the token in `.lemni/mcp-token` (made on first use,
  mode 600; `LEMNI_MCP_TOKEN` overrides). The AI panel shows the connect command with
  the token hidden and can make a new one. Station data, document text and link
  comments are labeled as source material, not instructions. Known limit: an AI app
  that can also click in the browser could click Allow once itself, so don't give it
  that permission for the board.
- **Clients.** Sessions report their names (Claude Code, Codex, …); the panel lists
  them and the top bar shows which one is working. Claude Code supports
  `list_changed` and waits ~28 h for a tool call by default, so approvals don't time out
  on its side.

## Persistence

The board you're editing is a working copy in tldraw's local IndexedDB persistence
(`basboard-dev-board`), so a reload never loses work. Board files move it to and from
disk (`studio/files/*`):

- **Format.** `.lemni` is a tldraw JSON file (`serializeTldrawJson`) with images
  inlined, so a board travels as one file. Open also accepts `.basboard` (boards from
  before the rename), `.tldr` and `.json`.
- **Names from before the rename.** Settings move from `basboard.*` to `lemni.*` keys
  once, before the studio loads (`studio/lib/storage-migration.ts`); `.basboard/` moves
  to `.lemni/` on first use; `BASBOARD_*` environment variables still work. The two
  IndexedDB databases (`basboard-dev-board`, `basboard-files`) and the `bas-*` shape
  types keep their names: renaming them would orphan saved work.
  Shape names, hidden flags and behaviors ride along in shape `meta`.
- **File System Access** (Chromium): Save writes back to the file it came from; Save
  as always asks. File handles for the current board and the recent list are kept in
  IndexedDB (`basboard-files`), and reopening asks for permission again if the
  browser dropped it. A recent file that moved or was deleted is removed from the list.
- **Fallback** (Safari, Firefox): Open uses a file input and Save downloads a copy.
- **Unsaved changes.** Any user edit to the document (not camera or selection) marks the
  board changed; New, Open and Open recent offer Save / Don't save / Cancel first.
  Swapping documents doesn't count as an edit and clears undo history.

Next: optional server storage. Credentials and live values are never stored in a board.

## Licensing

tldraw requires a license key in production (`NEXT_PUBLIC_TLDRAW_LICENSE_KEY`);
localhost works without one and shows a watermark. baskStream integrations must follow
its terms: least-privilege users, read-only by default, explicit customer authorization
before AI tooling touches a system.
