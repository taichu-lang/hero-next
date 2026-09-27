"use client";

import { Dropdown } from "@heroui/react";
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
