"use client";

import { cn, Dropdown, DropdownItemProps } from "@heroui/react";
import React, { useCallback, useRef, useState } from "react";

export function HoverDropdown({
  closeDelay = 500,
  trigger,
  children,
}: {
  closeDelay?: number;
  trigger: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState<boolean>(false);
  const closeTimer = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const handleEnter = useCallback(() => {
    clearTimers();
    setOpen(true);
  }, [clearTimers]);

  const handleLeave = useCallback(() => {
    clearTimers();
    closeTimer.current = window.setTimeout(() => {
      setOpen(false);
    }, closeDelay);
  }, [clearTimers, closeDelay]);

  return (
    <div onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      <Dropdown isOpen={open}>
        {trigger}
        <Dropdown.Popover
          placement="right"
          onMouseEnter={() => {
            clearTimers();
          }}
          onMouseLeave={handleLeave}
        >
          <Dropdown.Menu>{children}</Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
    </div>
  );
}

/**
 * DropdownItemEnd has an end indicator.
 */
export function DropdownItemEnd({
  className,
  children,
  ...props
}: Omit<DropdownItemProps, "children"> & { children: React.ReactNode }) {
  return (
    <Dropdown.Item {...props} className={cn("ps-2 pe-7", className)}>
      {children}
      <Dropdown.ItemIndicator className="inset-s-auto inset-e-2" />
    </Dropdown.Item>
  );
}
