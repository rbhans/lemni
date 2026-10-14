import "server-only"

import { appendFile, readFile } from "node:fs/promises"

import { localDataPath } from "./local-data"

// Every change sent to an outside system is logged here before it's sent and again
// with its outcome. If the first entry can't be written, the change isn't sent.

export interface AuditEntry {
  /** Ties an attempt to its outcome. */
  id: string
  at: string
  stage: "attempt" | "outcome"
  /** e.g. "point-write", "alarm-ack". */
  kind: string
  /** Where it went, e.g. the station origin. */
  target: string
  /** The account the system sees (the station user). */
  account: string
  /** Who asked: "AI app: Claude Code (approved in the board)" or "Person". */
  requestedBy: string
  reason?: string
  items: unknown[]
  outcome?: "succeeded" | "failed" | "partial"
  error?: string
}

export async function appendAudit(entry: AuditEntry) {
  const file = await localDataPath("audit.log")
  await appendFile(file, `${JSON.stringify(entry)}\n`, { mode: 0o600 })
}

/** The latest entries, newest first. */
export async function readAudit(limit = 50): Promise<AuditEntry[]> {
  try {
    const text = await readFile(await localDataPath("audit.log"), "utf8")
    return text
      .trim()
      .split("\n")
      .slice(-limit)
      .reverse()
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as AuditEntry]
        } catch {
          return []
        }
      })
  } catch {
    return []
  }
}
