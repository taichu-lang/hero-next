"use client";

import { Button, cn, Drawer, ScrollShadow, useMediaQuery, useOverlayState } from "@heroui/react";
import { PanelLeftCloseIcon } from "lucide-react";
import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Item } from "./Item";

const MOBILE_BREAKPOINT = 768;
const COLLAPSE_BREAKPOINT = 1024;
const EXPANDED_WIDTH = 280;
const COLLAPSED_WIDTH = 68;

interface SidebarContextValue {
  isMobile: boolean;
  isCollapsed: boolean;
  toggleCollapsed: () => void;
  isOpen: boolean;
  closeMobile: () => void;
  toggleMobile: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

function useSidebar() {
  const context = useContext(SidebarContext);

  if (!context) {
    throw new Error("Sidebar sub-components must be used within a <Sidebar>");
  }

  return context;
}

export interface SidebarProps {
  children: ReactNode;
  className?: string;
  /** Viewport width, in px, below which the sidebar renders as a Drawer. @default 768 */
  mobileBreakpoint?: number;
  /** Desktop viewport width, in px, below which the sidebar auto-collapses to a rail. @default 1024 */
  collapseBreakpoint?: number;
  /** Width in px when expanded. @default 280 */
  expandedWidth?: number;
  /** Width in px when collapsed to an icon rail. @default 72 */
  collapsedWidth?: number;
  /** Controlled collapsed state. When provided, auto-collapse-by-breakpoint is disabled. */
  isCollapsed?: boolean;
  defaultCollapsed?: boolean;
  onCollapsedChange?: (isCollapsed: boolean) => void;
}

export function Sidebar({
  children,
  className,
  mobileBreakpoint = MOBILE_BREAKPOINT,
  collapseBreakpoint = COLLAPSE_BREAKPOINT,
  expandedWidth = EXPANDED_WIDTH,
  collapsedWidth = COLLAPSED_WIDTH,
  isCollapsed: isCollapsedProp,
  defaultCollapsed = false,
  onCollapsedChange,
}: SidebarProps) {
  const isMobile = useMediaQuery(`(max-width: ${mobileBreakpoint - 1}px)`, {
    initializeWithValue: false,
  });
  const isBelowCollapseBreakpoint = useMediaQuery(`(max-width: ${collapseBreakpoint - 1}px)`, {
    initializeWithValue: false,
  });

  const isControlled = isCollapsedProp !== undefined;
  const [internalCollapsed, setInternalCollapsed] = useState(defaultCollapsed);
  const isCollapsed = isControlled ? isCollapsedProp : internalCollapsed;

  const setCollapsed = useCallback(
    (value: boolean) => {
      if (!isControlled) setInternalCollapsed(value);
      onCollapsedChange?.(value);
    },
    [isControlled, onCollapsedChange],
  );

  const previousRangeRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (isControlled || isMobile) return;
    if (previousRangeRef.current === isBelowCollapseBreakpoint) return;
    previousRangeRef.current = isBelowCollapseBreakpoint;
    setCollapsed(isBelowCollapseBreakpoint);
  }, [isBelowCollapseBreakpoint, isMobile, isControlled, setCollapsed]);

  const mobileState = useOverlayState();

  const context = useMemo<SidebarContextValue>(
    () => ({
      isMobile,
      isCollapsed,
      toggleCollapsed: () => setCollapsed(!isCollapsed),
      isOpen: mobileState.isOpen,
      closeMobile: mobileState.close,
      toggleMobile: mobileState.toggle,
    }),
    [isMobile, isCollapsed, mobileState, setCollapsed],
  );

  if (isMobile) {
    return (
      <SidebarContext.Provider value={context}>
        <Drawer state={mobileState}>
          <Drawer.Backdrop>
            <Drawer.Content placement="left">
              <Drawer.Dialog
                aria-label="Sidebar"
                className={cn("flex h-full w-[280px] max-w-[85vw] flex-col", className)}
              >
                {children}
              </Drawer.Dialog>
            </Drawer.Content>
          </Drawer.Backdrop>
        </Drawer>
      </SidebarContext.Provider>
    );
  }

  return (
    <SidebarContext.Provider value={context}>
      <aside
        className={cn(
          "border-default flex h-screen flex-col border-r",
          "transition-[width] duration-300 ease-in-out motion-reduce:transition-none",
          className,
        )}
        style={{ width: isCollapsed ? collapsedWidth : expandedWidth }}
      >
        {children}
      </aside>
    </SidebarContext.Provider>
  );
}

export interface SidebarHeaderProps {
  children: ReactNode;
  className?: string;
}

Sidebar.Header = function SidebarHeader({ children, className }: SidebarHeaderProps) {
  return (
    <div className={cn("border-default flex h-14 shrink-0 items-center gap-2 px-3", className)}>{children}</div>
  );
};

export interface SidebarBodyProps {
  children: ReactNode;
  className?: string;
}

Sidebar.Body = function SidebarBody({ children, className }: SidebarBodyProps) {
  return (
    <ScrollShadow className="min-h-0 flex-1" orientation="vertical">
      <nav className={cn("flex flex-col gap-1 p-2", className)}>{children}</nav>
    </ScrollShadow>
  );
};

export interface SidebarFooterProps {
  children: ReactNode;
  className?: string;
}

Sidebar.Footer = function SidebarFooter({ children, className }: SidebarFooterProps) {
  return (
    <div className={cn("border-default mt-auto flex shrink-0 items-center gap-2 border-t p-1.5", className)}>
      {children}
    </div>
  );
};

export interface SidebarItemProps {
  children: ReactNode;
  /** Destination URL. When set, the item renders as a Link. */
  href?: string;
  icon?: ReactNode;
  isActive?: boolean;
  disabled?: boolean;
}

Sidebar.Item = function SidebarItem({
  children,
  href,
  icon,
  isActive = false,
  disabled = false,
}: SidebarItemProps) {
  const { isCollapsed, isMobile, closeMobile } = useSidebar();

  const handleActivate = () => {
    if (isMobile) closeMobile();
  };

  return (
    <Item
      href={href}
      isActive={isActive}
      icon={icon}
      disabled={disabled}
      onClick={handleActivate}
      className={isCollapsed ? "w-fit self-center" : ""}
    >
      <Item.Content visible={isMobile || !isCollapsed}>{children}</Item.Content>
    </Item>
  );
};

export interface SidebarTriggerProps {
  className?: string;
  "aria-label"?: string;
}

Sidebar.Toggler = function SidebarToggler({
  className,
  "aria-label": ariaLabel = "Toggle sidebar",
}: SidebarTriggerProps) {
  const { isMobile, toggleMobile, toggleCollapsed } = useSidebar();

  return (
    <Button
      aria-label={ariaLabel}
      className={cn(className, "shrink-0")}
      isIconOnly
      variant="ghost"
      onPress={isMobile ? toggleMobile : toggleCollapsed}
    >
      <PanelLeftCloseIcon className="h-4.5 w-4.5" />
    </Button>
  );
};

export { useSidebar };
