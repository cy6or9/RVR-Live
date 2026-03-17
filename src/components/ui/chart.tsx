"use client"

import * as React from "react"
import * as RechartsPrimitive from "recharts"
import { cn } from "@/lib/utils"

const THEMES = { light: "", dark: ".dark" } as const

export type ChartConfig = {
  [k: string]: {
    label?: React.ReactNode
    icon?: React.ComponentType
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<keyof typeof THEMES, string> }
  )
}

type ChartContextProps = { config: ChartConfig }
const ChartContext = React.createContext<ChartContextProps | null>(null)

function useChart() {
  const ctx = React.useContext(ChartContext)
  if (!ctx) throw new Error("useChart must be used within a <ChartContainer />")
  return ctx
}

export const ChartContainer = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    config: ChartConfig
    children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"]
  }
>(({ id, className, children, config, ...props }, ref) => {
  const uid = React.useId()
  const chartId = `chart-${id || uid.replace(/:/g, "")}`

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        ref={ref}
        data-chart={chartId}
        className={cn(
          "flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-sector]:outline-none",
          className
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  )
})
ChartContainer.displayName = "Chart"

export const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
  const themed = Object.entries(config).filter(([_, c]) => c.theme || c.color)
  if (!themed.length) return null

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: Object.entries(THEMES)
          .map(
            ([theme, prefix]) => `
${prefix} [data-chart=${id}] {
${themed
  .map(([key, c]) => {
    const color = c.theme?.[theme] || c.color
    return color ? `  --color-${key}: ${color};` : ""
  })
  .join("\n")}
}`
          )
          .join("\n")
      }}
    />
  )
}

export const ChartTooltip = RechartsPrimitive.Tooltip

export const ChartTooltipContent = React.forwardRef<
  HTMLDivElement,
  { className?: string; hideLabel?: boolean; hideIndicator?: boolean; indicator?: "line" | "dot" | "dashed"; nameKey?: string; labelKey?: string; labelClassName?: string; color?: string }
>(({ className, hideLabel, hideIndicator, indicator = "dot", nameKey, labelKey, labelClassName, color, ...props }, ref) => {
  const { config } = useChart()

  // Tooltip runtime payload is passed to content renderer
  const tooltipProps = (props as any).tooltipProps || {}
  const payload = tooltipProps.payload as any[] | undefined
  const active = tooltipProps.active

  if (!active || !payload?.length) return null

  const item = payload[0]
  const key = `${labelKey || item.dataKey || item.name || "value"}`
  const cfg = getPayloadConfig(config, item, key)
  const val = cfg?.label || item.name

  return (
    <div
      ref={ref}
      className={cn(
        "grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl",
        className
      )}
    >
      {!hideLabel && (
        <div className={cn("font-medium", labelClassName)}>
          {typeof val === "string" || typeof val === "number" ? val : String(val)}
        </div>
      )}

      <div className="grid gap-1.5">
        {payload.map((p) => {
          const k = `${nameKey || p.name || p.dataKey || "value"}`
          const cfg2 = getPayloadConfig(config, p, k)
          const c = color || p.color || p.payload?.fill

          return (
            <div key={String(k)} className="flex w-full items-center justify-between gap-2">
              {!hideIndicator && (
                <div
                  className={cn(
                    "shrink-0 rounded-[2px]",
                    indicator === "dot" && "h-2.5 w-2.5",
                    indicator === "line" && "h-2.5 w-1",
                    indicator === "dashed" && "h-2.5 w-0 border border-dashed bg-transparent"
                  )}
                  style={{ backgroundColor: indicator === "dot" ? c : undefined, borderColor: c }}
                />
              )}
              <span className="text-muted-foreground">{cfg2?.label || p.name}</span>
              {p.value != null && <span className="font-mono font-medium">{p.value.toLocaleString()}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
})
ChartTooltipContent.displayName = "ChartTooltip"

export const ChartLegend = RechartsPrimitive.Legend

export const ChartLegendContent = React.forwardRef<
  HTMLDivElement,
  { className?: string; payload?: any[]; verticalAlign?: "top" | "bottom" | "middle"; hideIcon?: boolean; nameKey?: string }
>(({ className, hideIcon, payload, verticalAlign, nameKey }, ref) => {
  const { config } = useChart()
  if (!payload?.length) return null

  return (
    <div ref={ref} className={cn("flex items-center justify-center gap-4", verticalAlign === "top" ? "pb-3" : "pt-3", className)}>
      {payload.map((p) => {
        const k = `${nameKey || p.dataKey || "value"}`
        const cfg = getPayloadConfig(config, p, k)
        return (
          <div key={String(k)} className="flex items-center gap-1.5">
            {!hideIcon && <div className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: p.color }} />}
            {cfg?.label}
          </div>
        )
      })}
    </div>
  )
})
ChartLegendContent.displayName = "ChartLegend"

function getPayloadConfig(config: ChartConfig, payload: any, key: string) {
  if (!payload || typeof payload !== "object") return undefined
  const inner = typeof payload.payload === "object" ? payload.payload : {}
  const real =
    typeof payload[key] === "string"
      ? payload[key]
      : typeof inner[key] === "string"
      ? inner[key]
      : key

  return config[real] ?? config[key]
}
