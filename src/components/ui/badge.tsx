import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors duration-150",
  {
    variants: {
      variant: {
        default:     "text-white",
        secondary:   "",
        destructive: "bg-red-100 text-red-700",
        outline:     "border bg-transparent",
        success:     "bg-emerald-100 text-emerald-700",
        warning:     "bg-amber-100 text-amber-700",
        info:        "bg-cyan-100 text-cyan-700",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, style, ...props }: BadgeProps) {
  const varStyle: React.CSSProperties =
    variant === "default" || !variant
      ? { background: "var(--primary)", color: "#fff" }
      : variant === "secondary"
      ? { background: "var(--primary-mid)", color: "var(--primary)" }
      : variant === "outline"
      ? { borderColor: "var(--border-strong)", color: "var(--text-muted)" }
      : {}

  return (
    <div
      className={cn(badgeVariants({ variant }), className)}
      style={{ ...varStyle, ...style }}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
