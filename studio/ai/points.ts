"use client"

import {
  getDataSource,
  getDataSources,
  kindOfValue,
  type DataSource,
  type PointDragData,
} from "../data/live-points"
import type { JsonSchema } from "./schema"

// AI apps name points by their id in the station (an ord). Widgets need to know the
// point's kind (number, on/off, text), which arrives with its first live value.

export const pointIdSchema: JsonSchema = {
  type: "string",
  minLength: 3,
  maxLength: 2000,
  description:
    "A point's ord, e.g. slot:/Drivers/BacnetNetwork/AHU_1/points/DA-T (from find_points).",
}

export const sourceSchema: JsonSchema = {
  type: "string",
  description:
    "Data source id (from station_status). Leave out to use the connected station.",
}

/** The source to use: the one named, else the only (first) connected one. */
export function pickSource(id?: string): DataSource {
  const source = id ? getDataSource(id) : getDataSources()[0]
  if (!source)
    throw new Error(
      id
        ? `The data source ${id} isn't connected.`
        : "No station is connected. Ask the person to connect one in the Station panel."
    )
  return source
}

/** A readable name from an ord's last segment ("DA$2dT" → "DA-T"). */
export function pointLabel(point: string) {
  const tail = point.split("/").pop() ?? point
  return tail.replace(/\$([0-9a-fA-F]{2})/g, (_, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16))
  )
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Points as widgets want them, with kinds read from their first live values (waits up
 * to a few seconds). Points the station doesn't answer for come back with kind null.
 */
export async function resolvePoints(
  points: readonly string[],
  sourceId?: string
): Promise<PointDragData[]> {
  const source = pickSource(sourceId)
  const release = points.map((point) => source.watch(point))
  try {
    const deadline = Date.now() + 4000
    while (
      Date.now() < deadline &&
      points.some((point) => source.value(point).get() === undefined)
    )
      await sleep(100)
    return points.map((point) => ({
      source: source.id,
      point,
      label: pointLabel(point),
      kind: kindOfValue(source.value(point).get()),
    }))
  } finally {
    // Keep the interest a moment so a widget made from these takes over the watch.
    setTimeout(() => release.forEach((done) => done()), 5000)
  }
}
