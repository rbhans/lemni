# Project model: page categories, links, wire sheet

Agreed October 2026; built the same month (Links and Media import plugins, page
categories in the studio). The wider product decisions (who it's for, where it runs,
where boards are stored) are still open and may change storage details, not the model.

## Page categories

- Every page is a canvas page, and every page belongs to a category. A category can
  hold any number of pages.
- Built-in categories:
  - **Documents**: project files (control drawings, floor plans, sequences, Word
    documents, spreadsheets, images). Files dropped or added arrange themselves in a
    grid where there's room and can be moved freely. A PDF or Word file is **one
    compact card** that shows a page at a time (previous/next, a page list with link
    counts), so a 300-page set takes the room of one sheet; Word files page by their
    headings and scroll after a double-click. Each spreadsheet tab (or CSV) becomes a
    table. The original files are kept inside the board (up to 100 MB each for now).
    True vector PDFs come with the Vector PDF plugin.
  - **UI**: operator graphics built from the Library. Existing pages become UI pages.
  - **Wire sheet**: one per board, generated from links (below).
- People can add their own categories; each acts like Documents or like UI. Plugins
  can ship categories in their package.
- Categories change behavior: only UI pages appear in Present mode and in an exported
  viewer; Documents pages keep markup tools (pen, shapes, text, notes) but hide the BAS
  library, widgets and behaviors; the wire sheet only allows wiring.
- **Top bar**: every category is shown, each with a dropdown of its pages; the current
  category and page are marked. When the bar runs out of room, the categories collapse
  into one dropdown. The Pages section in the Layers panel groups pages the same way.
- Libraries stay in the Library panel; they are not a page category.

## Links

- Link ends: **frames**, document cards, a single page of a document card, whole
  pages, and station folders or points. Not individual symbols; putting things in
  frames is the standard practice.
- Workflow: **Link Mark** one item, go anywhere, **Link** to it (right-click menu,
  command palette, inspector, Links panel; station points and folders from the Station
  tree's right-click menu). Links have no meaningful
  direction; any relationship ("this sheet shows the sequence for that graphic") goes
  in the link's **comment**. Comments are plain text, editable later, and are mainly
  context for the AI.
- On the canvas, a linked frame shows a minimal badge with its link count; it opens the
  list (with comments) and jumps to the other end. Badges are hidden in Present mode.
- Deleting a linked frame removes its links and says how many (undo restores them).
- Links stay within one board for now.
- **Paste and paste special**: plain paste (⌘V) brings the drawing and names only;
  paste special (⇧⌘V) lists what plugins carry (behaviors and their point bindings,
  links) as checkboxes. Links that were kept point at the new copies; links to things
  outside the copy are copied too.

## Wire sheet

- Generated from the links: items as boxes (name, page, category color), links as
  wires. Shows linked items only, with a toggle for everything.
- Laid out automatically in the least messy way (grouped by category, few crossings).
  Boxes can be moved and keep their place; **Re-sort** lays everything out again.
- Dragging a wire between boxes creates a link.
- A left-side **Links panel** lists every linkable item by category and page, to
  browse, find, and drag onto the wire sheet.
- Selecting a box or wire shows its details and context (links, comments, page, station
  item) in the right panel; hovering a wire shows its comment as a tooltip.

## Open details

- Links live in the board's document-level meta (written as undoable changes).
  Moving to separate records, and storing big document sets outside the board file,
  ties to the storage decision.
- AI apps read links and comments with `list_links` and documents with
  `search_documents` / `read_document` (see ARCHITECTURE.md, AI). A persistent text
  index (for very large sets) waits for the storage decision.
