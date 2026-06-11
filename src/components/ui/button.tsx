import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-40 cursor-pointer select-none",
  {
    variants: {
      variant: {
        default:     "text-white shadow-sm active:scale-[0.98]",
        cta:         "text-white shadow-sm active:scale-[0.98]",
        destructive: "bg-red-600 text-white hover:bg-red-700",
        outline:     "border bg-white shadow-sm hover:shadow active:scale-[0.98]",
        secondary:   "shadow-sm active:scale-[0.98]",
        ghost:       "",
        link:        "underline-offset-4 hover:underline h-auto px-0 shadow-none",
      },
      size: {
        default: "h-8 px-4 py-1.5 text-sm",
        sm:      "h-7 px-3 text-xs rounded-md",
        lg:      "h-10 px-6 text-sm",
        icon:    "h-8 w-8 p-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, style, onMouseEnter, onMouseLeave, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"

    const baseStyle = React.useMemo((): React.CSSProperties => {
      if (variant === "default" || !variant) return { background: "var(--primary)", color: "#fff" }
      if (variant === "cta") return { background: "var(--cta)", color: "#fff" }
      if (variant === "outline") return { borderColor: "var(--border-strong)", color: "var(--text-700)" }
      if (variant === "secondary") return { background: "var(--primary-light)", color: "var(--primary)" }
      if (variant === "ghost") return { color: "var(--text-muted)" }
      if (variant === "link") return { color: "var(--primary)" }
      return {}
    }, [variant])

    const handleEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
      const el = e.currentTarget as HTMLElement
      if (variant === "default" || !variant) el.style.background = "var(--primary-hover)"
      else if (variant === "cta") el.style.background = "var(--cta-hover)"
      else if (variant === "ghost") el.style.background = "var(--surface-hover)"
      onMouseEnter?.(e)
    }
    const handleLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
      const el = e.currentTarget as HTMLElement
      if (variant === "default" || !variant) el.style.background = "var(--primary)"
      else if (variant === "cta") el.style.background = "var(--cta)"
      else if (variant === "ghost") el.style.background = "transparent"
      onMouseLeave?.(e)
    }

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        style={{ ...baseStyle, ...style }}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
