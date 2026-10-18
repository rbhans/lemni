# Lemscape architecture

Lemscape is the endless canvas for buildings: a hub for a project's documents (control
drawings, floor plans, specs), operator graphics with live data, trends and tables, and
the building systems it connects to (Niagara today), with AI apps working alongside.
It isn't a building automation system itself; it connects to them. The name comes from
the lemniscate, the ∞ curve, and a landscape: an endless space to lay a building out
on. It was called BAS Board while in development, then Lemni (renamed because another
Lemni brand exists in AI software); saved boards, settings and the local data folder
from both carry over (see Persistence). It is v2 of `bas-whiteboard` (basdraw),
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

The runtime and registry are in `studio/plugins/*`, the SDK in `sdk/`, and the
built-in plugins in `plugins/*`. How to write a plugin, and every contribution point:
[`PLUGINS.md`](PLUGINS.md). Every way content comes in, and what's left there:
[`INTAKE.md`](INTAKE.md).

A plugin is a folder, `plugins/<id>/`, whose `index.tsx` default-exports a typed
descriptor (`definePlugin({ … })`, a `BoardPlugin`). `scripts/plugins.mjs` finds the
folders and writes two files: `plugins/index.generated.ts` (the descriptors) and
`plugins/server.generated.ts` (each plugin's `server/routes.ts`, imported on first
use). `npm run dev` (`scripts/dev.mjs`) reruns it as plugin folders come and go,
`npm run build` runs it first, `npm run check` fails when the files are stale, and
`npm run new-plugin` scaffolds a new folder. `plugins/index.ts` orders the
plugins: required first, then by id.

- **The SDK boundary.** Plugins import the studio only through `@/sdk` (browser) and
  `@/sdk/server` (server), plus shadcn components and `cn`. `sdk/` is a curated
  re-export layer over `studio/` and `server/`, so the insides can move without
  breaking plugins. ESLint (`no-restricted-imports`) and `plugins/boundaries.test.ts`
  enforce it. The test also catches relative imports that leave a plugin's folder,
  and browser code that server code can reach. `sdk/core.ts` is the pure part, for
  modules tested with `node --test`.
- **Server routes.** `app/api/plugins/[plugin]/[[...path]]/route.ts` hands every
  request to `server/plugin-dispatch.ts`. That runs the request guard first, so no
  plugin can skip it, then the plugin's routes (`server/plugin-routes.ts`:
  `"METHOD /path"` keys, `:params`, a trailing `*rest`, 404 and 405 answers).
  `/api/mcp` keeps its own route because AI apps call it with a token, not as this
  browser; it checks the host with `guardHost`.
- **Storage.** `pluginStorage(id)` keeps settings under `lemscape.plugin.<id>.<name>`
  (moving older keys over), and a plugin's files on disk go in
  `.lemscape/plugins/<id>/` (`pluginDataPath`).
- **Versions.** Each plugin has `requiresSdk`, checked against `SDK_VERSION` in
  `registry.ts`: the same major version, and at least as new.

Rules (carried from v1, where they worked):

- **Installed vs enabled.** Engine pieces are always registered; enablement only gates
  UI, runtime and AI exposure.
- **Dependencies.** `dependencies` are required and resolved transitively: turning a
  plugin on turns on what it needs; turning it off turns off what needs it.
  `optionalDependencies` must degrade gracefully.
- **Only explicit choices are stored** (`lemscape.plugins.v1`), so new defaults apply
  without migrations.
- **Stages.** `preview` plugins are usable but incomplete; `planned` ones are listed so
  the manager shows the roadmap but cannot be enabled.
- **Isolation.** Every contribution renders inside a `PluginBoundary`.
- **Names.** Shape and binding types and tool ids are unique across plugins (tldraw
  would silently let a second util for a type replace the first). They should start
  with the plugin id; otherwise startup warns in development. The built-ins keep their
  `bas-*` types so boards load. Contribution ids are unique per list. The registry
  checks all of this at startup (`checkNames`).
- **Tests.** `registry.test.ts` validates the graph and the name checks, and checks
  every enable/disable combination resolves to a dependency-safe set.

Connections keep calling `registerDataSource` rather than listing sources in a
contribution: a source exists only while its connection is open and is keyed by the
system it reaches, so a contribution would have to carry a signal and every connection
plugin would still manage its own connect and disconnect (decided October 2026). Not
yet: loading plugins without rebuilding the app (plugins are compiled in).

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
  travel, per axis), scale, pipe flow, and On click: go to (any navigation target, see
  Navigation). Number
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
`../../symbol-library`, the single source shared with the QAGSchematic Niagara module) as a
native `bas-symbol` shape.

- **Source and build.** The SVGs are copied into `plugins/hvac-symbols/svg/` (their README
  documents the classes and variables) and compiled by `scripts/build-symbols.mjs` into
  `library.generated.ts`. `npm run symbols:sync` pulls a new copy of the library and
  rebuilds; `npm run symbols:build` rebuilds from the in-repo copy. The build fails on
  anything unexpected (scripts, links, ids, a viewBox not at 0 0, unscoped CSS).
- **Manifest.** What each piece is for, its search keywords, ports and point roles live in
  the library's `svg/library.json` (edited there, checked by its `tools/check.mjs`). The
  build writes them to `manifest.generated.ts` (shared roles expanded) and fails if a
  piece and its entry don't match; `manifest.ts` keeps the types.
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
- **Status plate.** Every piece but the runs and junctions has a plate (its shadow). A
  symbol's first bound behavior's point status reaches it through `ShapeStatusContext`
  and becomes one `st-*` class by Niagara's priority (disabled, fault, down, alarm,
  stale, overridden), which colors the plate and steps it out; disabled also grays the
  piece out. It is runtime only, like other behavior output.
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
- **API.** `/api/plugins/niagara-baskstream/…` (the plugin's `server/routes.ts`)
  hands everything to the plugin's handler, behind the shared request guard
  (`server/request-guard.ts`): loopback hosts only (override with
  `LEMSCAPE_ALLOWED_HOSTS`), same-origin, JSON bodies. Live values stream over
  server-sent events, batched every 100 ms.
- **Connect…** (`studio/shell/connect-dialog.tsx`; File → Connect…, the + under the
  connection panels, a pasted link). One address, checked by every enabled plugin's
  `connectionProbes` in parallel; exactly one match opens that connection's form filled
  in, several are listed, none offers the forms anyway. Probes ask through their own
  plugin's routes with `probeHttp` (`server/http-probe.ts`): https then http when no
  scheme was typed, plain GETs only, no credentials, redirects not followed, a
  certificate the computer doesn't trust reported instead of refused. The Niagara probe
  reads `/prelogin` and `/stream/health` signed out: a Niagara server header or
  baskStream's health answer is certain, a Niagara sign-in page likely
  (`plugins/niagara-baskstream/probe-model.ts`). Its form opens with the address and
  says when the certificate needs "Allow self-signed"; it never turns that on itself.
- **Connection icons.** `studio/shell/source-icon.ts` builds them from the vendor's letter
  (N Niagara, M Metasys, B BACnet) and a badge notched into the corner for how it
  connects: a dot for live, a cylinder for a SQL database, a page for a backup file.
  Plugins use it for their rail and panel icons and set `DataSource.icon`, which the
  Links panel and navigation targets show next to a point.
- **Provider-neutral values.** `studio/data/live-points.ts` defines `DataSource`,
  `PointRef` (`{ source, point }`), `useLivePoint` and `useLiveValues`. Sources are
  keyed by a stable id (`niagara:<station origin>`) so drawings can store point
  references. Behaviors and widgets use this API, never baskStream directly.
- **History.** `DataSource.history(point, { start, end, buckets })` returns rollup
  buckets (avg/min/max; booleans as 0–1). `studio/data/history.ts` shares requests:
  the window end snaps to the refresh period, so every chart showing the same point
  and range reuses one request. Niagara clamps a window to 31 days and 10–600 buckets
  of at least a minute.
- **Point drops.** The Station tree drags `application/x-lemscape-point` for a point
  and `application/x-lemscape-folder` for a folder; a folder is expanded on drop with
  `DataSource.pointsUnder` (breadth-first, a few levels, at most 300 points).
  `studio/editor/point-drop.tsx` routes the points to the first `pointDrops`
  contribution that claims the shape under the pointer (outlining it while dragging);
  contributions without `multiple` are skipped for folders. On empty canvas it runs the
  only option or shows a menu: each contribution's `create`/`creates` go under its
  `group` flyout (Data, HVAC, UI), options that `accepts` the points only, `suggested`
  ones first, then by `section`. A plugin can be left out of this menu with its switch in
  the Plugins dialog (`lemscape.point-menu-hidden.v1`). Flyouts are columns inside the
  one menu (a group's options, and inside it a flyout per section when there are
  several, e.g. HVAC ▸ Air side), opened by hovering with a short intent delay, a
  click, or the right arrow. Base UI submenus aren't used: under a menu opened at a
  point they close as soon as the pointer moves into them.
- **Placing a symbol for a point.** The HVAC flyout lists pieces whose manifest roles
  fit the point's kind, suggesting ones whose name matches both the role (SF-S: status)
  and the equipment (SF → fan). The piece is placed and its role's behavior bound
  through `studio/editor/behavior-binding.ts`, which the Behaviors plugin registers
  (`runtime/bind.ts`, the effect's defaults for the named state); with Behaviors off
  the piece is placed unbound.
- **Writes.** `DataSource.describeWrite` (writable, accepted actions, enum options) and
  `DataSource.write` (set, override with an optional duration, or auto), with who asked
  and why. Callers get the person's approval first: AI apps through the AI connection's
  Allow once + "Are you sure?", people through the UI elements' confirm dialog. The
  Niagara server writes an audit row before sending, sends once (no retries), reads
  back, and refuses when the station has writes turned off. Model edits will use
  baskStream's preview/apply plans.

## Metasys SCT archive

Implemented in `plugins/metasys-sct`: an offline Metasys archive (an SCT backup restored
to SQL Server) as a read-only data source.

- **Server.** `server/hub.ts` keeps one `mssql` pool per open archive on `globalThis`;
  the password is only in the pool's config. Every query is a fixed, parameterized
  `SELECT` (nothing writes). TLS is on; "Trust the server certificate" accepts a
  self-signed one, and an IP address gets `serverName: localhost` so TLS accepts it.
  `/api/plugins/metasys-sct` (same guard as stations) lists archives (online databases with
  `dbo.Item` and `dbo.ItemDefinition`, read from `master`), opens one, and serves
  `children`, `search`, `describe`, `under` and `values`.
- **Model.** `dbo.Item` rows (parent by `parentItemID`, engine by `DeviceItemID`) typed
  by `dbo.ItemDefinition` (`type`, `bacnetClassid`); deleted rows (`itemState = 0`)
  are skipped. A point's id is its FQR, the engine's reference plus its own
  (`SITE:NAE-1/FC-2.VMA-1.ZN-T`), stable across restores; item ids are used only for
  browsing and folder drags. Point kind comes from the BACnet class (AI/AO/AV number,
  BI/BO/BV boolean, MI/MO/MV multistate text). Pure helpers in `model.ts` are tested.
- **Network tree.** Site, engines, trunks, controllers and points; folders kept for
  other views (equipment, definitions, graphics, trend studies, `$`-prefixed) are left
  out. Equipment and Spaces views come later as their own tabs.
- **Values.** An archive is a snapshot: a point's value is its stored Present Value
  (attribute 85) when SCT kept one, otherwise "—". Values load once, no history or
  writes. Source id `sct:<database>`.

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

## UI elements

`plugins/ui-elements`: operator controls drawn with the app's own shadcn components, on
UI pages. Two shapes: `bas-ui` (one element) and `bas-ui-panel` (a card with a title
and rows; it grows as rows are added). An element is a plain record
(`model.ts`, tested) read through `normalizeElement`, so panels and single elements
share one renderer (`controls.tsx`).

- **Kinds.** Button (go to a target, or write a fixed value), switch, slider, setpoint
  (step up or down, then Set: one confirmation, not one per click), select (the
  station's own states via `describeWrite`, or a typed list), badge, progress and value.
  Writes are a plain set or an override (timed, or until released); "Auto" can be
  offered to release an override.
- **Board vs Present.** On the board an element is a shape (no pointer events, normal
  look). In Present mode it takes the pointer and stops it reaching tldraw.
- **Every write is confirmed.** `writes.tsx` shows the point, its value now, what it
  becomes and how (set / override for 1 h / release to auto), checks the point with
  `describeWrite` first, and only then calls `DataSource.write`, attributed to the
  control in the audit log.
- **Drops.** A point dropped on an element binds it; on empty canvas it becomes a
  suitable control (switch for on/off, setpoint for numbers). Points or a whole
  equipment folder dropped on a panel become rows; on empty canvas, a panel titled after
  the equipment.
- **AI tools** lay out elements and panels (`create_ui_elements`, `create_ui_panel`,
  `update_ui_element`) but can't press them.

## Navigation

`studio/navigation`, shared by behaviors ("On click: go to") and UI buttons. A target is
one string: a page id, any shape id, `doc:<shapeId>#<page>` (one page of a document
card), `point:<source>\n<point>\n<label>` (shown in the Station panel) or
`url:https://…` (http(s) only, new tab). Plain page and shape ids are targets as they
are, so older behaviors still work (`targets.ts`, tested). `TargetField` lists pages,
frames, documents and named shapes, takes a station point or web address, or picks on
the board: the next click (on any page) picks the shape there, a document card's
showing page, or the page itself, then returns to where picking started.

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
- **Pasted and dropped text** (`studio/editor/text-import.tsx`): tldraw's "url" and
  "text" content goes to plugins' `textImporters` (a web view for a link, a table for
  rows copied from a spreadsheet) alongside tldraw's own link card or text, which stays
  the default. One fitting choice runs at once; several open a menu where the content
  lands, the first highlighted so Enter takes it. A link a connection probe recognizes
  also offers Connect…; several links pasted at once become link cards.
- **Documents** (`plugins/media-import`): files are stored as board assets (data URLs,
  so a board stays one file). PDFs render a page at a time with pdf.js (loaded on
  demand, pages cached as images); Word files convert with mammoth and are sanitized
  (no scripts, handlers, or non-web links); sheets parse with read-excel-file or a
  small CSV parser (comma, semicolon or tab, worked out from the first line) and keep
  up to 2,000 rows. Files no importer takes, and that aren't images or video, get a
  message listing what opens.
- **Points lists** (`plugins/media-import/points-list.ts`, tested). A CSV or
  spreadsheet whose rows name points (an ORD or Metasys reference, a path like
  `AHU-1/DA-T`, or a point name beside an Equipment column) dropped on a UI page while
  a station is connected is matched to its points: each distinct name searched once,
  names compared exactly (`DA-T` isn't `DA-T-SP`, `VAV-2-1` is `VAV_2_01` but never
  `VAV-2-10`), narrowed by equipment, ambiguous rows left out. The matches go to the
  same menu as points dropped on empty canvas (`offerPoints`), with "Sheet, as it is"
  next to the live table, panel and trend. A sheet that came in earlier offers the same
  from its Live points section.

## Web view

`plugins/web-view`: a `bas-web` shape holding an iframe. While arranging, the page is
inert (pointer events off) so clicks select and move the shape; double-click enters
tldraw's editing state and hands the pointer to the page, and Present mode keeps it
live. The iframe is sandboxed without `allow-top-navigation`, so a page can't navigate
the board away. Addresses must be http(s), may not contain a login (it would be saved
in the board), and can't be the board itself. A pasted or dropped link offers a web
view next to the link card (a text importer).

Sites decide whether they may be framed (`X-Frame-Options`, CSP `frame-ancestors`),
and browsers don't tell the embedding page why a frame is blank. So
`/api/plugins/web-view/check` (guarded like every plugin route) reads just those
headers from the local server and the shape explains a refusal instead of showing a
blank frame. It skips certificate checks because it only reads two headers and stations often use
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
board tab ◀──SSE: tool calls── /api/plugins/assistant/bridge
board tab ──POST: tool list, results, focus──▶ /api/plugins/assistant/bridge
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
  reloading board answers "Lemscape isn't open". `board_status` is served by the server
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
  `.lemscape/audit.log` before they're sent (no log, no write), sent once, never
  retried, read back after 250 ms and logged with their outcome. The station API only
  accepts writes marked confirmed and validates every item again.
- **Security.** `/api/mcp` answers local addresses only, rejects browser origins other
  than its own, and requires the token in `.lemscape/mcp-token` (made on first use,
  mode 600; `LEMSCAPE_MCP_TOKEN` overrides). The AI panel shows the connect command with
  the token hidden and can make a new one. Station data, document text and link
  comments are labeled as source material, not instructions. Known limit: an AI app
  that can also click in the browser could click Allow once itself, so don't give it
  that permission for the board.
- **Clients.** Sessions report their names (Claude Code, Codex, …); the AI panel
  lists them and shows which one is working. Claude Code supports
  `list_changed` and waits ~28 h for a tool call by default, so approvals don't time out
  on its side.

## Persistence

The board you're editing is a working copy in tldraw's local IndexedDB persistence
(`basboard-dev-board`), so a reload never loses work. Board files move it to and from
disk (`studio/files/*`):

- **Format.** `.lemscape` is a tldraw JSON file (`serializeTldrawJson`) with images
  inlined, so a board travels as one file. Open also accepts `.lemni` and `.basboard`
  (boards saved under earlier names), `.tldr` and `.json`.
- **Names from before the renames.** Settings move from `lemni.*` and `basboard.*` to
  `lemscape.*` keys once, before the studio loads (`studio/lib/storage-migration.ts`);
  `.lemni/` (or `.basboard/`) moves to `.lemscape/` on first use; `LEMNI_*` and
  `BASBOARD_*` environment variables still work. The two
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
