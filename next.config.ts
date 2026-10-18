import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // A package-lock.json in the home folder otherwise makes Turbopack guess the wrong root.
  turbopack: { root: process.cwd() },
  // The "N" badge sat on the rail's Plugins button. Build and runtime errors still show.
  devIndicators: false,
}

export default nextConfig
