"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"

// The template's "d" hotkey was removed: on the canvas, D selects the draw tool.
// Theme is switched from the top bar instead.
function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  )
}

export { ThemeProvider }
