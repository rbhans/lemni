// Live data, provider-neutral. Connection plugins register a DataSource; everything
// else (widgets, behaviors, UI elements, AI tools) reads and writes points through it
// and never imports a connection plugin directly.

export {
  FOLDER_DRAG_TYPE,
  getDataSource,
  getDataSources,
  kindOfValue,
  numericValue,
  POINT_DRAG_TYPE,
  pointKey,
  readFolderDrag,
  readPointDrag,
  registerDataSource,
  useDataSource,
  useDataSources,
  useLivePoint,
  useLiveValues,
  type DataSource,
  type FolderDragData,
  type HistoryBucket,
  type HistoryQuery,
  type LiveValue,
  type PointDragData,
  type PointKind,
  type PointOption,
  type PointRef,
  type PointWriteRequest,
  type StatusKind,
  type WriteAction,
  type WriteCapability,
  type WriteOutcome,
  type WriteRequester,
} from "@/studio/data/live-points"

/** Rolled-up history for several points (trend charts), cached and refreshed. */
export { usePointHistories, type HistoryState } from "@/studio/data/history"

/**
 * Offer what points can become (a live table, a panel, a trend…), as when they're
 * dropped on empty canvas, e.g. for the rows of a points list that matched.
 */
export {
  offerPoints,
  type PointOffer,
  type PointOfferExtra,
} from "@/studio/editor/point-drop"

/** Pick a point from any connection, and show its live value. */
export {
  LiveValueBadge,
  PointField,
  pointName,
} from "@/studio/data/point-field"

/**
 * Addresses people type or paste for a station or server (for connection probes and
 * forms), and whether a host is on a private network.
 */
export {
  isPrivateHost,
  parseAddress,
  type ParsedAddress,
} from "@/studio/lib/address"
