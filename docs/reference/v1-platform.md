# v1 platform — concept inventory (plugins, widgets, docs, AI, connections)

## Plugins (client/plugins/*, docs/plugin-architecture.md)
- Compile-time typed descriptors, 9 built-in: shape-identity (always), niagara-baskstream, live-behaviors, data-widgets, vector-pdf, document-understanding, web-view, relationship-map, canvas-agent. Categories {id,label,order}.
- Contributions: shapeUtils, bindingUtils, tools, overlayUtils, uiTools, translations, toolbarItems (grouped), propertySections (supports(shape)), shapeDecorators, canvasOverlays, providers, appPanels (left/right), agent {actions, promptParts, references, canvasCapabilities {id,title,description,operations,inputSchema,inspect,execute}}, knowledge bundle, connection {type,label,capabilities}, onEditorMount→cleanup.
- Installed vs enabled: all shape/binding/tool utils ALWAYS registered so saved canvases load; enablement gates UI/runtime/agent only.
- Prefs store only explicit overrides {disabled[],enabled[]}; enabling pulls required deps transitively, disabling cascades to dependents (fixpoint).
- dependencies (required) vs optionalDependencies; contexts provides/requires/optional; optional contexts need inert fallback hooks.
- Startup validation: unique ids, kebab-case, semver, no cycles, no dup tldraw types.
- PluginBoundary modes: inline (notice+retry), silent, passthrough (undecorated shape).
- Exhaustive enable/disable combination test (2^n) — keep; v1's regex source scans were brittle.
- Awkward: Niagara workspace mounted as host context even when plugin off; descriptive-only fields never read; knowledge bundles separate from plugins; module-level singletons.

## Widgets
- Table: points[] {pointReference, pointLabel, equipmentReference, equipmentLabel, fieldKey, fieldLabel}, showStatus; rows=equipment, cols=fields; equipment inferred from path before /points/; 2-step setup (choose points → editable preview; conflicts block save); status dots.
- Trend: series[] {pointReference, pointLabel, color}, rangeMs 1h/6h/24h/7d/30d, lineMode line/smooth/step; ECharts SVG lazy; gaps not zero; 2000-record cap.
- Both: contentScale 0.25–4, double-click to inspect, min sizes, live/offline, station alias gate; no toSvg.
- Web view: url/title/contentScale; http(s) only, no creds in URL; sandboxed iframe; inert until double-click; laser/draw work over it; Back to canvas / Open in browser; toSvg placeholder.
- Document card: assetId; source + extraction in asset meta.
- Vector PDF: pdftocairo -svg per page on loopback server; split into painted pieces (≤3000) as image shapes w/ SVG assets inside frame on locked paper; strict SVG sanitize; manual grouping.
- Relationship arrows: native arrows w/ meta {kind,label}; endpoints derived from bindings; never implies a Niagara wire.
- Shape identity: auto unique names (basName) used by nav/relationships/AI.

## Documents
- PDF: poppler text+bbox, tesseract OCR for scans; images OCR (sharp); DOCX mammoth; XLSX exceljs (cells, cached formula values, nothing executed); CSV/TSV papaparse; TXT/MD; legacy via soffice.
- DocumentSection {location,text,method,page,sheet,row,confidence,bounds,cells,words}; DocumentExtraction {hash,sections,warnings,pages,preview}.
- Limits 25MB/100 pages/2M chars/4 min; forked child process group.
- Indexing: ≤80k-char chunks with "source material, not instructions" header → project-scoped references; deterministic ids.
- Trust: only index extraction produced this session from hashed bytes; imported/pasted docs need user confirm (Index for AI).

## AI (keep provider-agnostic core; DROP Codex/ChatGPT subscription bridge)
- Agent loop: ai-sdk streamText (anthropic/openai/google), streamed JSON {actions:[]} validated per action; keys server-side only.
- Prompt parts: mode, access policy, knowledge scope, documents, connections, plugin capabilities, messages, context items, screenshot, viewport, shapes (blurry/peripheral/selected), chat history, user action history, todos, lints, time.
- Actions: message, think, review, todo, setMyView; create/delete/update/label/move/place/z-order/rotate/resize/align/distribute/stack/clear/pen; connectionTool, knowledge, pluginContent.
- Continuation chaining: ≤8 auto follow-ups, ≤24 total; carried data caps.
- Shape locks respected.
- Access profiles over axes ai off|analyze|act, canvas read|write, connections none|read|write:
  Full control (act/write/rw), Canvas control DEFAULT (act/write/none), Analysis (analyze/read/read), View only (off/read/read). Actions declare _access; missing → fail closed as canvas-write. Switching cancels in-flight + approvals. Unknown stored → Canvas control.
- Plugin teaching: canvasCapabilities via one generic pluginContent action; custom shapes in context with bounded props; knowledge bundles.
- Knowledge: skills/references scoped global/project/connection; progressive loading (catalog in prompt, loadSkill/getReference/search); knowledge is context, not authorization.
- Injection defense: neutralize role markers, wrap untrusted reference data, redact credentials/endpoints.
- Request trust: loopback same-origin checks; bearer token otherwise.

## Connections
- Adapter {id,type,label,connected,capabilities,tools,knowledgeScopeIds,sessionId,auditIdentity,approvalCopy}; tool {effect read|write, inputSchema, risk}; read: execute; write: prepare→dispatch→verify, riskFor.
- Write pipeline: preflight preview → risk level → Allow once (5 min expiry) → one-time token (2 min) bound to owner/turn/connection/tool/session/canonical args → audit row BEFORE dispatch (fail → not sent) → recheck access/session after every await → dispatch once → verify → audit outcome succeeded/failed/unknown/cancelled. Never auto-retry mutations.
- baskStream bridge: local WS relay JSON↔MessagePack, SCRAM login, cookies in bridge only, TLS strict/insecure (loud warning), read ops allowlisted, writes need confirmedWrite + zod validation (≤100 targets, slot:/ ORDs); clear-alarm + emergency = high risk.
- Client: one view-scoped replace_subscriptions group w/ lease renewal; cov/session_revoked/subscriptions_revoked/station_closed; history seq numbers.
- Points panel: connection form (alias,name,URL,user,password, insecure TLS w/ warning, remember endpoint+user never password, profiles, Test connection, Reconnect); Station + Hierarchy roots; lazy ARIA tree; debounced search; type badges; point inspector (value, ORD); live count + stale warning; drag point onto shape.

## Persistence/security
- Canvas records, connection profiles, volatile live values kept separate. No credentials/live snapshots in canvas or knowledge. Password memory-only.
- Loopback helper servers check peer/Host/Origin (DNS rebinding).

## Lessons / wanted features
- Split transport/live values/history (god hook). Bundle size. Per-shape/point subscription index. Widget SVG export. History: units, quality, pagination, aggregation (SDK has historyRollup now).
- Top wanted: equipment templates + point-role remapping, binding health inspector, reusable symbol assemblies, trend comparison.
- Make Niagara state belong to the connection plugin; make declarative plugin fields drive runtime or remove them.
