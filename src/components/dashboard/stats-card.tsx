import React from "react"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"
import { cn } from "@/lib/utils"

interface StatsCardProps {
  title: string
  value: string | number
  description?: string
  icon?: React.ReactNode
  trend?: { value: number; label?: string }
  color?: "blue" | "green" | "red" | "amber" | "purple" | "cyan"
  className?: string
  mono?: boolean
}

const ICON_COLORS: Record<string, { bg: string; color: string }> = {
  blue:   { bg: "var(--primary-light)", color: "var(--primary)" },
  green:  { bg: "var(--success-bg)",    color: "var(--success)" },
  red:    { bg: "var(--danger-bg)",     color: "var(--danger)" },
  amber:  { bg: "var(--warning-bg)",    color: "var(--warning)" },
  purple: { bg: "var(--primary-mid)",   color: "var(--primary)" },
  cyan:   { bg: "#FCE7F3",              color: "#DB2777" },
}

export function StatsCard({ title, value, description, icon, trend, color = "blue", className, mono = false }: StatsCardProps) {
  const ic = ICON_COLORS[color]
  const isPositive = (trend?.value ?? 0) > 0
  const isNeutral = (trend?.value ?? 0) === 0

  return (
    <div
      className={cn("rounded-xl p-5 transition-shadow duration-200 hover:shadow-md cursor-default", className)}
      style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide truncate" style={{ color: "var(--text-subtle)" }}>
            {title}
          </p>
          <p
            className={cn("mt-1.5 text-2xl font-bold leading-tight", mono && "font-mono")}
            style={{ color: "var(--text-900)", fontFamily: mono ? "var(--font-mono)" : undefined }}
          >
            {value}
          </p>
          {/* Trend indicator */}
          {trend !== undefined && (
            <div className={cn("mt-1.5 flex items-center gap-1 text-xs font-semibold")}>
              {isNeutral ? (
                <Minus className="h-3.5 w-3.5" style={{ color: "var(--text-subtle)" }} />
              ) : isPositive ? (
                <TrendingUp className="h-3.5 w-3.5" style={{ color: "var(--success)" }} />
              ) : (
                <TrendingDown className="h-3.5 w-3.5" style={{ color: "var(--danger)" }} />
              )}
              <span style={{ color: isNeutral ? "var(--text-subtle)" : isPositive ? "var(--success)" : "var(--danger)" }}>
                {isPositive ? "+" : ""}{trend.value}%
              </span>
              {trend.label && (
                <span style={{ color: "var(--text-subtle)", fontWeight: 400 }}>{trend.label}</span>
              )}
            </div>
          )}
          {description && !trend && (
            <p className="mt-1 text-xs truncate" style={{ color: "var(--text-subtle)" }}>{description}</p>
          )}
        </div>
        {icon && (
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ background: ic.bg, color: ic.color }}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}
