// Types shared by the SCT archive plugin's server and client.

import type { ValueKind } from "./model"

/** How to reach a SQL Server holding SCT archives (no password: that stays on the server). */
export interface SctServerProfile {
  server: string
  port: number
  username: string
  /** Accept the server's self-signed certificate (typical for SQL Express). */
  trustCertificate: boolean
}

export interface SctConnectRequest extends SctServerProfile {
  password: string
  /** The archive database. */
  database: string
}

export interface SctConnectionInfo extends SctServerProfile {
  id: string
  database: string
  /** The archive's own name (its root item), usually the database name. */
  archive: string
  /** SCT release that last wrote it, when known. */
  release: string | null
}

/** A node of the network tree. */
export interface SctNode {
  /** Item id, for browsing (not stable across restores). */
  id: number
  /** Fully qualified reference: the stable id for points. */
  fqr: string
  name: string
  /** The display path Metasys shows (UserName). */
  display: string
  type: string
  /** e.g. "JCI Analog Value", "N2 Controller". */
  definition: string
  classId: number | null
  /** AI, BO, MV…; null when it isn't a point value. */
  pointType: string | null
  kind: ValueKind | null
  hasChildren: boolean
}

export interface SctPointValue {
  fqr: string
  ok: boolean
  value: boolean | number | string | null
  display: string
  units: string | null
  /** Which stored attribute the value came from, when there is one. */
  from: "present value" | "relinquish default" | "default value" | null
}

export interface SctPointDetail extends SctNode {
  description: string | null
  objectId: string | null
  /** The engine's reference. */
  device: string | null
  /** Its parent in the tree, for revealing it. */
  path: { id: number; name: string }[]
}
