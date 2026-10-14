import { cn } from "@/lib/utils"

export const PRODUCT_NAME = "Lemni"
export const PRODUCT_TAGLINE = "The endless canvas for buildings"

/** The lemniscate (∞) the name comes from: two rounded boards joined by one endless line. */
export const LOOP_PATH =
  "M4 12C4 8.5 4.5 8 8 8C11.5 8 12.5 16 16 16C19.5 16 20 15.5 20 12C20 8.5 19.5 8 16 8C12.5 8 11.5 16 8 16C4.5 16 4 15.5 4 12Z"

/** Endless-loop mark with its live point, on a dark tile in both themes. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex size-6 items-center justify-center rounded-md bg-stone-950 dark:ring-1 dark:ring-white/10",
        className
      )}
    >
      <svg viewBox="0 0 24 24" fill="none" className="size-[20px]" aria-hidden>
        <path
          d={LOOP_PATH}
          className="stroke-primary"
          strokeWidth={2.1}
          strokeLinejoin="round"
        />
        <circle
          cx={19.31}
          cy={8.69}
          r={1.7}
          className="fill-white stroke-stone-950"
          strokeWidth={0.9}
        />
      </svg>
    </span>
  )
}
