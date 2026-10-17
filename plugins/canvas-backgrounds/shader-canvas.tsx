"use client"

import { useEffect, useRef } from "react"
import { useEditor, useValue, type Editor } from "tldraw"

import {
  backgroundColors,
  backgroundIntensity,
  THEME_COLOR_TOKENS,
} from "./state"
import {
  fragmentSource,
  simSource,
  VERTEX_SOURCE,
  type ShaderBackground,
} from "./shaders"

/** Peak tint opacity. Low enough that the grid's dots stay the strongest mark. */
const STRENGTH = { light: 0.18, dark: 0.22 }
const FRAME_MS = 1000 / 60
/** How far the pattern drifts per screen pixel the camera pans. */
const PARALLAX = 0.08
const RIPPLES = 4

type Rgb = [number, number, number]

/** Resolves a CSS color (oklch included) to 0–1 RGB via a 1px canvas. */
export function resolveColor(css: string, fallback: Rgb): Rgb {
  const ctx = document.createElement("canvas").getContext("2d")
  if (!ctx || !css) return fallback
  ctx.fillStyle = css
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return [r / 255, g / 255, b / 255]
}

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn("Canvas background shader:", gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function link(gl: WebGLRenderingContext, fragmentSrc: string) {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SOURCE)
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSrc)
  const program = gl.createProgram()
  if (!vertex || !fragment || !program) return null
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  gl.deleteShader(vertex)
  gl.deleteShader(fragment)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn("Canvas background program:", gl.getProgramInfoLog(program))
    gl.deleteProgram(program)
    return null
  }
  return program
}

function makeTarget(gl: WebGLRenderingContext, width: number, height: number) {
  const texture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  // Velocity is stored around 0.5, so start there: still, with no ink.
  const pixels = new Uint8Array(width * height * 4)
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i + 2] = 128
    pixels[i + 3] = 128
  }
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    width,
    height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    pixels
  )
  const framebuffer = gl.createFramebuffer()
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture,
    0
  )
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  return { texture, framebuffer, width, height }
}

/** Draws each character into its own cell of a white-on-clear texture. */
function makeGlyphAtlas(
  gl: WebGLRenderingContext,
  { chars, width, height }: NonNullable<ShaderBackground["glyphs"]>
) {
  const ratio = 2 * window.devicePixelRatio
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(chars.length * width * ratio)
  canvas.height = Math.round(height * ratio)
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  ctx.scale(ratio, ratio)
  ctx.fillStyle = "#fff"
  ctx.font = `${Math.round(height * 0.8)}px ui-monospace, SFMono-Regular, Menlo, monospace`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ;[...chars].forEach((char, i) =>
    ctx.fillText(char, (i + 0.5) * width, height * 0.55)
  )
  const texture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas)
  return texture
}

/** The densest grid level tldraw draws at least half opaque, in CSS px. */
function gridLattice(editor: Editor): [number, number, number] {
  if (!editor.getInstanceState().isGridMode) return [0, 0, 0]
  const { x, y, z } = editor.getCamera()
  const size = editor.getDocumentSettings().gridSize
  const steps = editor.options.gridSteps
  // Same fade-in tldraw's DefaultGrid uses between `min` and `mid`.
  const opacity = ({ min, mid }: (typeof steps)[number]) =>
    z < mid ? (z - min) / (mid - min) : 1
  const level =
    [...steps].reverse().find((step) => opacity(step) >= 0.5) ?? steps[0]
  const s = level.step * size * z
  const mod = (v: number) => ((v % s) + s) % s
  // Matches tldraw's DefaultGrid, which puts dots at 0.5 + camera offset.
  return [mod(0.5 + x * z), mod(0.5 + y * z), s]
}

/** Pointer state shared with the shaders, eased toward where the pointer is. */
function trackPointer(canvas: HTMLCanvasElement) {
  const state = {
    x: -1e4,
    y: -1e4,
    smoothX: -1e4,
    smoothY: -1e4,
    velX: 0,
    velY: 0,
    inside: false,
    hover: 0,
    ripples: Array.from({ length: RIPPLES }, () => [0, 0, -1]),
    nextRipple: 0,
    pendingClicks: [] as [number, number][],
  }
  const local = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    return {
      x,
      y,
      inside: x >= 0 && y >= 0 && x <= rect.width && y <= rect.height,
    }
  }
  const onMove = (event: PointerEvent) => {
    const p = local(event)
    state.x = p.x
    state.y = p.y
    state.inside = p.inside
  }
  const onDown = (event: PointerEvent) => {
    // Clicks on the board only, not on panels floating over it.
    if (!(event.target as Element | null)?.closest?.(".tl-canvas")) return
    const p = local(event)
    if (p.inside) state.pendingClicks.push([p.x, p.y])
  }
  const onLeave = () => {
    state.inside = false
  }
  const options = { capture: true, passive: true } as const
  window.addEventListener("pointermove", onMove, options)
  window.addEventListener("pointerdown", onDown, options)
  document.documentElement.addEventListener("pointerleave", onLeave)
  return {
    state,
    /** Eases the cursor and hover, and stamps clicks with the shader clock. */
    step(dt: number, time: number) {
      if (state.smoothX < -1e3) {
        state.smoothX = state.x
        state.smoothY = state.y
      }
      const k = 1 - Math.exp(-dt * 18)
      const nx = state.smoothX + (state.x - state.smoothX) * k
      const ny = state.smoothY + (state.y - state.smoothY) * k
      const vx = dt > 0 ? (nx - state.smoothX) / dt : 0
      const vy = dt > 0 ? (ny - state.smoothY) / dt : 0
      state.velX += (vx - state.velX) * Math.min(1, dt * 20)
      state.velY += (vy - state.velY) * Math.min(1, dt * 20)
      state.smoothX = nx
      state.smoothY = ny
      const target = state.inside ? 1 : 0
      state.hover += (target - state.hover) * (1 - Math.exp(-dt * 3))
      for (const [x, y] of state.pendingClicks) {
        state.ripples[state.nextRipple] = [x, y, time]
        state.nextRipple = (state.nextRipple + 1) % RIPPLES
      }
      state.pendingClicks.length = 0
    },
    stop() {
      window.removeEventListener("pointermove", onMove, options)
      window.removeEventListener("pointerdown", onDown, options)
      document.documentElement.removeEventListener("pointerleave", onLeave)
    },
  }
}

/**
 * Paints one shader background over the canvas fill, in screen space. It follows
 * the pointer, runs at a reduced resolution, pauses while the tab is hidden, and
 * holds a single still frame (no pointer effects) under Reduce motion.
 */
export function ShaderCanvas({ background }: { background: ShaderBackground }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const editor = useEditor()
  const dark = useValue("dark mode", () => editor.user.getIsDarkMode(), [
    editor,
  ])
  // View → Reduce motion (it starts from the system setting).
  const still = useValue(
    "reduce motion",
    () => editor.user.getAnimationSpeed() === 0,
    [editor]
  )
  const intensity = useValue(
    "background intensity",
    () => backgroundIntensity.get(),
    []
  )
  const colors = useValue("background colors", () => backgroundColors.get(), [])

  useEffect(() => {
    const canvas = ref.current
    const gl = canvas?.getContext("webgl", {
      premultipliedAlpha: true,
      antialias: false,
      alpha: true,
    })
    if (!canvas || !gl) return
    // fwidth() for crisp lines; every WebGL device in use today has it.
    gl.getExtension("OES_standard_derivatives")

    const display = link(gl, fragmentSource(background))
    const sim = background.sim ? link(gl, simSource(background)) : null
    if (!display || (background.sim && !sim)) return

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW
    )
    const bindQuad = (program: WebGLProgram) => {
      gl.useProgram(program)
      const position = gl.getAttribLocation(program, "position")
      gl.enableVertexAttribArray(position)
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
    }

    const uniforms = (program: WebGLProgram) => {
      const at = (name: string) => gl.getUniformLocation(program, name)
      return {
        res: at("u_res"),
        css: at("u_css"),
        scale: at("u_scale"),
        time: at("u_time"),
        dt: at("u_dt"),
        offset: at("u_offset"),
        mousePx: at("u_mousePx"),
        mouseVel: at("u_mouseVel"),
        hover: at("u_hover"),
        ripples: at("u_ripples"),
        grid: at("u_grid"),
        tintA: at("u_tintA"),
        tintB: at("u_tintB"),
        strength: at("u_strength"),
        sim: at("u_sim"),
        prev: at("u_prev"),
        glyphs: at("u_glyphs"),
        glyphCount: at("u_glyphCount"),
        simRes: at("u_simRes"),
      }
    }
    const u = uniforms(display)
    const us = sim ? uniforms(sim) : null

    const styles = getComputedStyle(document.documentElement)
    const tintA = resolveColor(
      colors.primary ?? styles.getPropertyValue(THEME_COLOR_TOKENS.primary),
      [0.6, 0.85, 0.2]
    )
    const tintB = resolveColor(
      colors.secondary ?? styles.getPropertyValue(THEME_COLOR_TOKENS.secondary),
      [0.2, 0.65, 0.85]
    )
    const strength =
      (dark ? STRENGTH.dark : STRENGTH.light) *
      (background.gain ?? 1) *
      intensity
    const glyphs = background.glyphs
      ? makeGlyphAtlas(gl, background.glyphs)
      : null

    const pointer = trackPointer(canvas)
    let targets: ReturnType<typeof makeTarget>[] = []

    const resize = () => {
      const scale = window.devicePixelRatio * background.resolution
      const width = Math.max(1, Math.round(canvas.clientWidth * scale))
      const height = Math.max(1, Math.round(canvas.clientHeight * scale))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
      if (sim) {
        const simScale = background.simScale ?? 0.3
        const sw = Math.max(8, Math.round(canvas.clientWidth * simScale))
        const sh = Math.max(8, Math.round(canvas.clientHeight * simScale))
        if (
          !targets.length ||
          targets[0].width !== sw ||
          targets[0].height !== sh
        ) {
          for (const target of targets) {
            gl.deleteTexture(target.texture)
            gl.deleteFramebuffer(target.framebuffer)
          }
          targets = [makeTarget(gl, sw, sh), makeTarget(gl, sw, sh)]
        }
      }
      return scale
    }

    const setShared = (
      uu: ReturnType<typeof uniforms>,
      scale: number,
      time: number,
      dt: number
    ) => {
      const cssW = canvas.clientWidth || 1
      const cssH = canvas.clientHeight || 1
      const { state } = pointer
      gl.uniform2f(uu.res, canvas.width, canvas.height)
      gl.uniform2f(uu.css, cssW, cssH)
      gl.uniform1f(uu.scale, scale)
      gl.uniform1f(uu.time, time)
      gl.uniform1f(uu.dt, dt)
      const { x, y, z } = editor.getCamera()
      // Screen-space pan, scaled to the shader's height-normalized units.
      gl.uniform2f(
        uu.offset,
        (-x * z * PARALLAX) / cssH,
        (y * z * PARALLAX) / cssH
      )
      gl.uniform2f(uu.mousePx, state.smoothX, state.smoothY)
      gl.uniform2f(uu.mouseVel, state.velX / cssH, -state.velY / cssH)
      gl.uniform1f(uu.hover, still ? 0 : state.hover)
      gl.uniform4fv(
        uu.ripples,
        state.ripples.flatMap(([rx, ry, rt]) => [rx, ry, still ? -1 : rt, 0])
      )
      gl.uniform3fv(uu.grid, gridLattice(editor))
    }

    const simulate = (scale: number, time: number, dt: number) => {
      if (!sim || !us) return
      const [read, write] = targets
      bindQuad(sim)
      setShared(us, scale, time, dt)
      gl.uniform2f(us.simRes, write.width, write.height)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, read.texture)
      gl.uniform1i(us.prev, 0)
      gl.bindFramebuffer(gl.FRAMEBUFFER, write.framebuffer)
      gl.viewport(0, 0, write.width, write.height)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      targets = [write, read]
    }

    const render = (scale: number, time: number, dt: number) => {
      bindQuad(display)
      setShared(u, scale, time, dt)
      gl.uniform3fv(u.tintA, tintA)
      gl.uniform3fv(u.tintB, tintB)
      gl.uniform1f(u.strength, strength)
      if (sim) {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, targets[0].texture)
        gl.uniform1i(u.sim, 0)
      }
      if (glyphs && background.glyphs) {
        gl.activeTexture(gl.TEXTURE1)
        gl.bindTexture(gl.TEXTURE_2D, glyphs)
        gl.uniform1i(u.glyphs, 1)
        gl.uniform1f(u.glyphCount, background.glyphs.chars.length)
        gl.activeTexture(gl.TEXTURE0)
      }
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    const start = performance.now()
    let frame = 0
    let last = start

    const loop = (now: number) => {
      frame = requestAnimationFrame(loop)
      if (document.hidden || now - last < FRAME_MS - 2) return
      // Clamp the step so a backgrounded tab doesn't jump the simulation.
      const dt = Math.min((now - last) / 1000, 1 / 20)
      last = now
      const time = (now - start) / 1000
      pointer.step(dt, time)
      const scale = resize()
      simulate(scale, time, dt)
      render(scale, time, dt)
    }

    // The canvas element outlives this effect (theme flips rerun it), so free what
    // was made here rather than losing the context.
    const release = () => {
      pointer.stop()
      gl.deleteBuffer(buffer)
      gl.deleteProgram(display)
      if (sim) gl.deleteProgram(sim)
      if (glyphs) gl.deleteTexture(glyphs)
      for (const target of targets) {
        gl.deleteTexture(target.texture)
        gl.deleteFramebuffer(target.framebuffer)
      }
    }

    if (still) {
      // One frame, redrawn only when the view changes. A simulation is run forward
      // a few seconds first so it has something to show.
      const time = 12
      const drawStill = () => {
        const scale = resize()
        render(scale, time, 0)
      }
      const scale = resize()
      for (let i = 0; i < 240; i++) simulate(scale, 8 + i / 60, 1 / 60)
      drawStill()
      const observer = new ResizeObserver(drawStill)
      observer.observe(canvas)
      const stop = editor.store.listen(drawStill, { scope: "session" })
      return () => {
        observer.disconnect()
        stop()
        release()
      }
    }

    const scale = resize()
    render(scale, 0, 0)
    frame = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(frame)
      release()
    }
  }, [background, dark, still, intensity, colors, editor])

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 size-full"
    />
  )
}
