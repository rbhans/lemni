# Roadmap

## 0 · Foundation (done)

- UI design boards: canvas workspace, behaviors + station, AI workspace, plugin manager.
- Next.js 16 app with the shadcn preset and tldraw 5 mounted without its UI.
- Shell: menubar, pages, workspaces, panel rail, docks, Inspector, tool dock, status bar.
- Plugin runtime with dependency resolution, stages, boundaries and tests.
- Built-ins: Canvas core (layers, library, transform/align/arrange, menus, status),
  Pen & shapes (tools incl. the Shapes dropdown, appearance and text sections), HVAC & BAS symbols.
  Previews: Behaviors, Media import,
  Niagara · baskStream, Assistant (AI workspace). Planned: Charts, Tables, Vector PDF,
  Web view.

## 1 · Canvas fundamentals — usable

Done:
- Native `bas-symbol` shape for the base library (32 Plate-style pieces from
  `symbol-library`: theme-aware, states, stretchable ducts and pipes, flip-safe labels).
- Board files: new, open, save, save as, recent boards, unsaved-changes prompt;
  `.lemscape` files (formerly `.lemscape`, `.basboard`) with images inlined; download/upload fallback without file access.
- Shape names: rename in Layers (double-click) and the Inspector header.
- Hide/show in Layers, Object → Hide (⇧⌘H) and Show all hidden.
- Pages section in Layers: add, rename, duplicate, reorder, delete.
- Command palette (⌘K) over menus, commands, tools, panels, pages, layers and Library;
  keyboard shortcut sheet (?). Plugins add entries with `commands`.

Next:
- Symbol variants (swap a piece for another of its kind), ports, point roles.
- Reopen a board on the page it was saved on.

## 2 · Live data (Niagara · baskStream) — usable

Done:
- baskStream SDK vendored (`vendor/baskstream-sdk`, refresh with `npm run vendor:baskstream`).
- Server connection hub in the Next process: one SDK client per station, one shared
  leased watch per connection, per-tab interest sets, 30 s grace on reloads.
- `/api/stations` (local-only, same-origin, JSON): connect, browse, search, describe,
  read, 24 h history rollups, open alarms, watch, and an SSE live stream.
- Provider-neutral live values (`studio/data/live-points.ts`): `DataSource`,
  `useLivePoint`, refcounted interest.
- Station panel: connect form with remembered profiles (never passwords) and
  self-signed opt-in with warning, lazy tree with live values, search, alarms, point
  inspector with status, age and sparkline. Top-bar pill and status-bar count.
- Simulated station for development (`npm run sim`).

Next:
- Hierarchy view (when the station advertises it) and tags.
- Keyboard navigation in the tree; remember expanded branches.
- Writes from AI apps: done (approval, audit, read-back). Next: writes from the point
  inspector for people.
- Multiple simultaneous stations.

## 2b · Metasys SCT archive (offline) — started

Done:
- Read-only SQL Server connection to restored SCT archives: find archives, open one,
  network tree (site → engines → trunks → controllers → points) with point type and
  stored value, search, point details, drags and link marks like the Station tree.

Next:
- Equipment and Spaces tabs (SCT's other views), equipment definitions and their points.
- Several archives open at once; enum state names from the translation dictionary.

## 3 · Behaviors — in progress

Done:
- Effect registry: value label, color, level fill, visibility, opacity, blink, rotate
  (follow/spin with pivot), move (follow/travel), scale, pipe flow, On click: go to.
- Rule-card editor in the Inspector's Behavior tab: switch/range/states/value mappings,
  conditions, bindable number parameters, ramp time, validation and conflict warnings.
- Drop a point from the Station panel onto a shape to start a behavior.
- Drafts preview live; test values without a station; Live effects switch.
- Runtime: nearest-owner composition across groups, eased motion that returns to rest,
  image recolor and level fill clipped to the artwork.
- Present mode with click navigation.

Next:
- Symbol state: done for the library's built-in states (on, flow, dirty filter, reverse,
  damper position, level, sash). Next: variants and per-symbol state presets.
- Multi-selection editing; presets and equipment templates with point-role remapping.
- Interactions: writing a point from a shape's own behavior (controls exist as UI
  elements; see Data widgets).

## 4 · Data widgets — in progress

Done:
- Trend chart: drop points onto it (or onto empty canvas to start one), panes per unit,
  on/off lanes, min–max band, live tail, crosshair readout, ranges 1 h – 31 days,
  light/dark palette, SVG/PNG export.
- Live table: list or by-equipment pivot (inferred), sortable values and status,
  "N more" instead of scrolling, CSV export.
- Shared history API with request sharing; `pointDrops` contribution point and the
  drop-choice menu; shared point picker.
- Stat tile: value, change over a window (toned by which way is good), sparkline;
  on/off points show their on-time share.
- Gauge (dial or bar) with a scale and low/high warning and alarm limits.
- Drag a whole folder (equipment, device, network) from the Station tree: charts take
  up to eight of its points; tables split it into one table per kind of equipment.
- UI elements plugin (shadcn): button (go to / write a value), switch, slider,
  setpoint, select, badge, progress, value, and panels of rows. Live in Present mode;
  every write is confirmed and audited; set or override (timed or until released) with
  an optional "Auto" release. Folder drop builds a panel.
- Shared navigation targets: any page, shape, document page, station point or web
  address, chosen from a list or picked on the board; used by "On click: go to" too.

Next:
- Bar and comparison charts.
- Table view of a chart's data; CSV import.
- Custom value scales and setpoint bands on trends; per-series display names.

## Project model — usable

Done (see [`PROJECT-MODEL.md`](PROJECT-MODEL.md)):
- Page categories: Documents, UI and the generated Wire sheet, plus your own; shown
  in the top bar (collapsing on narrow windows) and grouped in the Pages panel; tools,
  Library, Behaviors and Present mode follow the page's kind.
- Links: Link mark / Link from the right-click menu, palette, inspector, Links panel
  and the Station tree; comments; minimal badges that jump to the other end; removed (and restored on
  undo) with their frame.
- Wire sheet: generated boxes and wires, drag between boxes to link, hover for the
  comment, Linked / All frames, Re-sort.
- Paste special (⇧⌘V): plain paste leaves behaviors and links out; paste special
  keeps them (plugins add options).
- Documents: PDF and Word cards (page at a time, page-level links), spreadsheets and
  CSV as tables, grid placement, files kept in the board.

Next:
- Search inside documents (and text for the AI); thumbnails in the page list.
- Templates and point roles (re-point a pasted graphic to another unit).

## 5 · Media and documents

- PDF, Word, Excel/CSV import with local extraction and indexing.
- Vector PDF import (v1 pipeline).
- Web view (done): a browser window on the canvas, inserted next to Image or video.
  Double-click to use the page; live in Present mode; tells you when a site refuses
  to be framed. Next: try it against a real station's login.

## 6 · AI — usable

Done (October 2026): AI through the person's own AI app over MCP, no chat in the board.
- MCP endpoint (`/api/mcp`, token in `.lemscape/`), board-tab bridge, AI panel (who's
  connected, access level, connect commands for Claude Code, Claude Desktop and Codex,
  activity), top-bar status, working chip, change outlines and follow.
- Plugin `ai` contribution: tools, guides, shape descriptions. Tools for the canvas,
  library, links, behaviors, charts, tables, documents, web view and the station.
- Station writes and alarm acknowledgements: approval dialog (Allow once, then "Are
  you sure?"), audit log, read-back. The simulator accepts writes.
- Agent-ready HVAC library: piece descriptions (ports, point roles), place_symbols,
  connect_ports, place_run (whole air/water paths), check_layout; read_document zooms
  into regions of big drawings.
- Shared manifest: piece descriptions, keywords, ports and roles moved to the symbol
  library's `svg/library.json`, shared with the Niagara module. Status plates show the
  first bound point's Niagara status.

Next:
- Pinned AI comments on the canvas; an "undo everything this AI did" control.
- Knowledge: project notes and point-role conventions the AI reads first.
- Library: ports drawn into the art (coil water stubs), snapshot tests per piece and
  state.
- Schedules and station model edits (preview → apply) as write tools.
- An optional built-in chat with an API key for people without an AI app.
- Remote boards: OAuth for the MCP endpoint once boards are hosted.
