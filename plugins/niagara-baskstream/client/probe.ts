"use client"

import { toast } from "sonner"

import {
  parseAddress,
  pluginApi,
  type ConnectionMatch,
  type ConnectionProbeContribution,
} from "@/sdk"

import {
  looksLikeStationUrl,
  sameStation,
  type StationProbeResult,
} from "../probe-model"
import { connectDraft, connection, NIAGARA_ICON } from "./store"

const api = pluginApi("niagara-baskstream")

/** The address to put in the form when the probe didn't find one: https unless typed. */
function formAddress(typed: string) {
  const parsed = parseAddress(typed)
  return parsed.ok ? parsed.url.origin : typed.trim()
}

function certificateProblem(match: ConnectionMatch | null): string | null {
  const data = match?.data as { certificateProblem?: unknown } | undefined
  return typeof data?.certificateProblem === "string"
    ? data.certificateProblem
    : null
}

/** Connect… recognizes a Niagara station and opens the Station panel's form, filled in. */
export const stationProbe: ConnectionProbeContribution = {
  id: "niagara-station",
  order: 10,
  label: "Niagara station",
  icon: NIAGARA_ICON,
  recognizes: looksLikeStationUrl,
  async probe(address, signal) {
    const result = await api.request<StationProbeResult>(
      `/probe?address=${encodeURIComponent(address)}`,
      { signal }
    )
    if (result.error) throw new Error(result.error)
    return result.match
  },
  open(ctx, address, match) {
    const station = match?.address ?? formAddress(address)
    const info = connection.get()
    if (info?.status === "connected" && sameStation(info.station, station))
      toast.info(`Already connected to ${info.name}.`)
    else
      connectDraft.set({
        station,
        certificateProblem: certificateProblem(match),
      })
    ctx.openPanel("station")
  },
}
