// Wire sheet layout: one column per category, boxes ordered to keep wires from
// crossing. Pure (no React, no DOM, relative imports only) so `node --test` can run it.

export const NODE = { w: 220, h: 56, gapX: 160, gapY: 20 }

export interface LayoutNode {
  key: string
  /** Column rank (lower is further left). */
  column: number
  label: string
}

export interface LayoutEdge {
  a: string
  b: string
}

export type Positions = Map<string, { x: number; y: number }>

/**
 * Places every node: columns left to right by rank, rows ordered by where their
 * neighbours sit (a few barycenter sweeps), names breaking ties.
 */
export function layoutAll(
  nodes: readonly LayoutNode[],
  edges: readonly LayoutEdge[]
): Positions {
  const ranks = [...new Set(nodes.map((n) => n.column))].sort((a, b) => a - b)
  const columns = ranks.map((rank) =>
    nodes
      .filter((n) => n.column === rank)
      .sort((a, b) =>
        a.label.localeCompare(b.label, undefined, { numeric: true })
      )
  )
  const neighbours = new Map<string, string[]>()
  for (const { a, b } of edges) {
    neighbours.set(a, [...(neighbours.get(a) ?? []), b])
    neighbours.set(b, [...(neighbours.get(b) ?? []), a])
  }
  const row = new Map<string, number>()
  const index = () =>
    columns.forEach((column) => column.forEach((n, i) => row.set(n.key, i)))
  index()

  const sweep = (order: number[]) => {
    for (const c of order) {
      const column = columns[c]
      const weight = new Map(
        column.map((n, i) => {
          const rows = (neighbours.get(n.key) ?? [])
            .map((k) => row.get(k))
            .filter((r): r is number => r !== undefined)
          // Unconnected nodes keep their place.
          return [
            n.key,
            rows.length ? rows.reduce((s, r) => s + r, 0) / rows.length : i,
          ]
        })
      )
      column.sort((x, y) => weight.get(x.key)! - weight.get(y.key)!)
      column.forEach((n, i) => row.set(n.key, i))
    }
  }
  const forward = columns.map((_, i) => i)
  for (let pass = 0; pass < 3; pass++) {
    sweep(forward)
    sweep([...forward].reverse())
  }
  index()

  const out: Positions = new Map()
  columns.forEach((column, c) =>
    column.forEach((n, r) =>
      out.set(n.key, {
        x: c * (NODE.w + NODE.gapX),
        y: r * (NODE.h + NODE.gapY),
      })
    )
  )
  return out
}

/**
 * Where a new node goes without moving anyone: under the lowest node in its column,
 * or in the column's slot by rank if the column is empty.
 */
export function placeNew(
  existing: readonly { column: number; x: number; y: number }[],
  column: number
): { x: number; y: number } {
  const same = existing.filter((n) => n.column === column)
  if (same.length) {
    const x = same[0].x
    const y = Math.max(...same.map((n) => n.y)) + NODE.h + NODE.gapY
    return { x, y }
  }
  const ranks = [...new Set([...existing.map((n) => n.column), column])].sort(
    (a, b) => a - b
  )
  return { x: ranks.indexOf(column) * (NODE.w + NODE.gapX), y: 0 }
}
