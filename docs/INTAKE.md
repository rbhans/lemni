# Bringing things in

Lemscape is a hub people use to varying degrees, so getting content onto the board
should take as little as possible: drop it, paste it, or type where it lives. This is
every way in, what works, what changed in October 2026, and what's left. Each path is
a plugin contribution; [`PLUGINS.md`](PLUGINS.md) says how to add to it.

| Way in | Where | State |
| --- | --- | --- |
| Drop or pick files | `fileImporters` (media import), tldraw for images and video | Good |
| Paste or drop links and text | `textImporters` (new), tldraw's link card and text as the default | Good |
| Points lists (CSV, XLSX) | media import, `offerPoints` (new) | New |
| Connect to a system | `connectionProbes` (new), Connect… | New |
| Points from a connection tree | `pointDrops` (`studio/editor/point-drop.tsx`) | Good |
| Point fields and search | `PointField` (`studio/data/point-field.tsx`) | Good |
| Library | `libraryCollections` (canvas core's Library panel) | Good |
| Web view | web view plugin | Good |
| AI apps | plugins' `ai` tools over MCP | Gaps |

## What each does

**Files.** PDFs and Word files become cards you page through, spreadsheets one table per
sheet (2,000 rows), CSV a table; images and video go to tldraw. Several files fill a grid
beside what's there. Insert → Documents… works on any page; the Documents toolbar has
the same picker. *Changed:* CSV files may use semicolons or tabs, and `.tsv` opens. A
file nothing opens (`.txt`, an old `.xls`) now says "Can't open notes.txt" and lists what
does, instead of tldraw's "File type is not allowed"; an importer that fails is named.

**Links and text.** Was: a pasted link became a bookmark titled with its own URL (tldraw
fetches the page from the browser, which can't read it), with no way to get a web view;
rows copied from a spreadsheet became one run of text ("PointValueDA-T55RA-T72"). Now a
menu opens where the paste lands: Link card, Web view, and Connect to *host*… when a
connection probe recognizes the link; copied rows offer Table first. The first choice is
highlighted, so ⌘V then Enter is still one step; plain text and several links at once
paste straight away. Links dragged from another tab get the same menu at the drop point.

**Points lists.** A CSV or spreadsheet that names points (ORDs, Metasys references, paths
like `AHU-1/DA-T`, or point names beside an Equipment column) dropped on a UI page while
a station is connected is matched to the station's points and offered like a point drop:
live table, trend, UI panel, or "Sheet, as it is". Names match exactly (`DA-T` isn't
`DA-T-SP`; `VAV-2-1` is `VAV_2_01`), rows that could be more than one point are left out,
and the toast says how many matched. Not connected: the sheet comes in and a toast offers
Connect…; afterwards the table's Live points section has Match to points….

**Connect….** File → Connect…, the + under the connection panels, a pasted link, or the
point picker when nothing is connected. Type an address (`10.0.0.20`, `jace.local:8443`,
a full URL); every enabled connection plugin's probe checks it through its own server
route, and when one recognizes it that connection's form opens filled in with the cursor
on the login. The Niagara probe asks for `/prelogin` and `/stream/health` signed out,
works out https or http, and notices a self-signed certificate; the form then explains
the "Allow self-signed" switch but never turns it on. The Station panel can also connect
to another station without disconnecting first (the one it replaces is closed).

**Point drops, point fields, Library, web view.** These worked and stay as they were,
with small fixes: point search shows what the connections that answered found when
another fails, marks which connection a result is from when several are open, and offers
Connect… when none is; Disconnect no longer leaves "That station connection is no longer
open" on the form (a late watch request after the source stopped).

**AI apps.** Tools create shapes, pages, library items, HVAC symbols and runs, charts,
live tables, UI elements, web views and links, and read documents. They can't add a
document or a plain table, or make a link card.

## Decided

Connection plugins keep handing over live data with `registerDataSource`, not a
contribution: a source exists only while its connection is open and is keyed by the
system it reaches, so a contribution list would carry a signal and save no code.

## Follow-ups

- **Link cards with titles.** A server route that reads a page's title and icon, used as
  tldraw's url asset handler, so cards show what they link to and a station with a
  self-signed certificate doesn't raise "Couldn't load URL preview".
- **More probes.** Haystack (nHaystack at `/haystack/about`, the recipe is in
  PLUGINS.md) and BACnet come with their plugins; the Metasys archive could recognize SQL
  Server on port 1433.
- **Type an address in the command palette** to Connect to it.
- **Pasted ORDs** (`station:|slot:/…`) could show the point in the Station panel or bind
  it, as a Niagara text importer.
- **AI tools** for a plain table (`create_sheet`, rows read from a spec) and a document
  from a URL.
- **Bigger points lists.** Matching asks the station once per point name and sees at
  most 100 results (the station search limit); a list with hundreds of identical VAV
  points needs paging or a search per equipment folder. Niagara display names aren't
  matched (search results carry slot names).
- **Formats.** Old `.xls` and `.doc`, plain `.txt` and `.md`, floor plans (DXF, DWG).
- **Keyboard.** The menu for points dropped on empty canvas doesn't take Enter until an
  arrow key picks a row, unlike the paste menu.
- **Library.** No way to add your own pieces (the selection, an image) to it yet.
