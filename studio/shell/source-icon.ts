import type { IconSvgElement } from "@hugeicons/react"

// Icons for data connections: a tile with the vendor's letter, and a badge notched
// into its bottom-right corner for how it connects. The tile is dashed while the
// connection isn't open. Same grid and stroke as the Hugeicons set, so they sit in
// the rail and menus like any other icon.

/** How a connection reaches its data. */
export type SourceBadge = "live" | "sql" | "file"

const LETTERS = {
  // Niagara
  N: "M8.5 15.5V7.5L14.5 15.5V7.5",
  // Metasys
  M: "M7.5 15.5V7.5L11.5 12.5L15.5 7.5V15.5",
  // BACnet
  B: "M8.5 15.5V7.5H12C13.24 7.5 14 8.2 14 9.25C14 10.3 13.24 11.5 12 11.5H8.5M12 11.5C13.5 11.5 14.5 12.3 14.5 13.5C14.5 14.7 13.5 15.5 12 15.5H8.5",
} as const

export type SourceLetter = keyof typeof LETTERS

// The tile (x 2.5–20.5, corner radius 5) left open where the badge sits: a circle of
// radius 6.2 around (20, 20) cuts the right and bottom edges at 13.82.
const TILE =
  "M13.82 20.5H7.5C4.74 20.5 2.5 18.26 2.5 15.5V7.5C2.5 4.74 4.74 2.5 7.5 2.5H15.5C18.26 2.5 20.5 4.74 20.5 7.5V13.82"

const STROKE = {
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  strokeWidth: "1.5",
} as const

const BADGES: Record<SourceBadge, IconSvgElement> = {
  // A dot: a running system.
  live: [
    ["circle", { cx: "20", cy: "20", r: "1.4", fill: "currentColor", ...STROKE, key: "b0" }],
  ],
  // A cylinder: a database.
  sql: [
    ["ellipse", { cx: "20", cy: "17.4", rx: "2.9", ry: "1.1", ...STROKE, key: "b0" }],
    [
      "path",
      {
        d: "M17.1 17.4V22.2C17.1 22.8 18.4 23.3 20 23.3C21.6 23.3 22.9 22.8 22.9 22.2V17.4",
        ...STROKE,
        key: "b1",
      },
    ],
  ],
  // A page with a folded corner: a backup or export file.
  file: [["path", { d: "M17.6 16.4H20.4L22.4 18.4V22.8H17.6Z", ...STROKE, key: "b0" }]],
}

const cache = new Map<string, IconSvgElement>()

/**
 * The icon for a connection, e.g. `sourceIcon("N", "live")` for a live Niagara station;
 * `connected: false` dashes the tile.
 */
export function sourceIcon(
  letter: SourceLetter,
  badge: SourceBadge,
  connected = true
): IconSvgElement {
  const key = `${letter}:${badge}:${connected}`
  let icon = cache.get(key)
  if (!icon) {
    icon = [
      [
        "path",
        {
          d: TILE,
          ...STROKE,
          ...(connected ? {} : { strokeDasharray: "2.6 3" }),
          key: "tile",
        },
      ],
      ["path", { d: LETTERS[letter], ...STROKE, key: "letter" }],
      ...BADGES[badge],
    ]
    cache.set(key, icon)
  }
  return icon
}
