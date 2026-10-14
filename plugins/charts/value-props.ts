// Props shared by the single-value widgets (stat tile, gauge).

import { T } from "tldraw"

export interface ValuePointProps {
  /** Empty until a point is dropped or chosen. */
  source: string
  point: string
  label: string
  kind: "number" | "boolean" | "text"
  /** Units when the point was added (the live value's units win while connected). */
  units: string
}

export const valuePointValidators = {
  source: T.string,
  point: T.string,
  label: T.string,
  kind: T.literalEnum("number", "boolean", "text"),
  units: T.string,
}

export const EMPTY_POINT: ValuePointProps = {
  source: "",
  point: "",
  label: "",
  kind: "number",
  units: "",
}
