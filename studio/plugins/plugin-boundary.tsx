"use client"

import { Component, type ReactNode } from "react"

import { Button } from "@/components/ui/button"

interface PluginBoundaryProps {
  pluginId: string
  /** `inline` shows a small notice with Retry; `silent` renders nothing. */
  mode?: "inline" | "silent"
  /** Rendered instead when the contribution fails (e.g. the undecorated shape). */
  fallback?: ReactNode
  children: ReactNode
}

/** Keeps one failing contribution from taking the whole studio down. */
export class PluginBoundary extends Component<
  PluginBoundaryProps,
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error(`[plugin:${this.props.pluginId}]`, error)
  }

  render() {
    if (!this.state.error) return this.props.children
    if (this.props.fallback !== undefined) return this.props.fallback
    if (this.props.mode === "silent") return null
    return (
      <div className="m-2 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs text-destructive">
        <span className="flex-1">
          This part of “{this.props.pluginId}” failed to load.
        </span>
        <Button
          size="xs"
          variant="outline"
          onClick={() => this.setState({ error: null })}
        >
          Retry
        </Button>
      </div>
    )
  }
}
