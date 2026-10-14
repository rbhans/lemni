import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // A package-lock.json in the home folder otherwise makes Turbopack guess the wrong root.
  turbopack: { root: process.cwd() },
}

export default nextConfig
