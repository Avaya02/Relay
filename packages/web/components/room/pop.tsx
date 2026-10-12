"use client";

import type { ReactElement, ReactNode } from "react";
import { Popover, Tooltip } from "radix-ui";

// Radix for what a hand-rolled panel can't do cheaply: portal (no clipping),
// viewport flip, and focus return.
export function RoomPopover({
  trigger,
  children,
  label,
  align = "end",
  width,
}: {
  trigger: ReactElement;
  children: ReactNode;
  label: string;
  align?: "start" | "center" | "end";
  width?: string;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="rpop"
          align={align}
          sideOffset={8}
          collisionPadding={12}
          aria-label={label}
          style={width ? { width: `min(${width}, calc(100vw - 24px))` } : undefined}
        >
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function Tip({
  label,
  keys,
  side = "bottom",
  children,
}: {
  label: string;
  keys?: string;
  side?: "top" | "bottom" | "left" | "right";
  children: ReactElement;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="rtip" side={side} sideOffset={6} collisionPadding={8}>
          {label}
          {keys && <kbd>{keys}</kbd>}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
