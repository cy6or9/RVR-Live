"use client";

import * as React from "react";
import {
  PanelGroup as PanelGroupPrimitive,
  Panel as PanelPrimitive,
  PanelResizeHandle as PanelResizeHandlePrimitive,
  type PanelGroupProps as PrimitivePanelGroupProps,
  type PanelProps as PrimitivePanelProps,
  type ImperativePanelGroupHandle,
  type ImperativePanelHandle,
} from "react-resizable-panels";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------
   PANEL GROUP
   ✔ ref typed as ImperativePanelGroupHandle (library's imperative API)
------------------------------------------------------------------- */

export const PanelGroup = React.forwardRef<
  ImperativePanelGroupHandle,
  PrimitivePanelGroupProps
>(({ className, ...props }, ref) => (
  <PanelGroupPrimitive
    ref={ref}
    className={cn("flex h-full w-full", className)}
    {...props}
  />
));
PanelGroup.displayName = "PanelGroup";

/* ------------------------------------------------------------------
   PANEL
   ✔ ref typed as ImperativePanelHandle (NOT HTMLDivElement)
------------------------------------------------------------------- */

export const Panel = React.forwardRef<ImperativePanelHandle, PrimitivePanelProps>(
  ({ className, ...props }, ref) => (
    <PanelPrimitive
      ref={ref}
      className={cn("relative min-w-[50px] min-h-[50px]", className)}
      {...props}
    />
  )
);
Panel.displayName = "Panel";

/* ------------------------------------------------------------------
   PANEL RESIZE HANDLE
   ✔ ref goes on wrapper <div>, not on the primitive
------------------------------------------------------------------- */

export const PanelResizeHandle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    {...props}
    className={cn("relative flex items-center justify-center", className)}
  >
    <PanelResizeHandlePrimitive
      className={cn(
        "bg-border transition-colors",
        // horizontal
        "data-[panel-group-direction=horizontal]:w-px data-[panel-group-direction=horizontal]:cursor-col-resize data-[panel-group-direction=horizontal]:hover:bg-border/80",
        // vertical
        "data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:cursor-row-resize data-[panel-group-direction=vertical]:hover:bg-border/80"
      )}
    />
  </div>
));
PanelResizeHandle.displayName = "PanelResizeHandle";

/* ------------------------------------------------------------------
   RESIZABLE ROOT WRAPPER
------------------------------------------------------------------- */

export const Resizable = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("relative flex h-full w-full overflow-hidden", className)}
    {...props}
  />
);
Resizable.displayName = "Resizable";
