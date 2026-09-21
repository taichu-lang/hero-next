"use client";

import type { AnchorHTMLAttributes, DetailedHTMLProps, ReactNode } from "react";

import {
  Button,
  Drawer,
  Link,
  ScrollShadow,
  useMediaQuery,
  useOverlayState,
} from "@heroui/react";
import clsx from "clsx";
import { PanelLeftCloseIcon } from "lucide-react";
import NextLink from "next/link";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const MOBILE_BREAKPOINT = 768;
const COLLAPSE_BREAKPOINT = 1024;
const EXPANDED_WIDTH = 280;
const COLLAPSED_WIDTH = 72;

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
  const isBelowCollapseBreakpoint = useMediaQuery(
    `(max-width: ${collapseBreakpoint - 1}px)`,
    { initializeWithValue: false },
  );

  const isControlled = isCollapsedProp !== undefined;
  const [internalCollapsed, setInternalCollapsed] = useState(defaultCollapsed);
  const isCollapsed = isControlled ? isCollapsedProp : internalCollapsed;

  const setCollapsed = (value: boolean) => {
    if (!isControlled) setInternalCollapsed(value);
    onCollapsedChange?.(value);
  };

  const previousRangeRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (isControlled || isMobile) return;
    if (previousRangeRef.current === isBelowCollapseBreakpoint) return;
    previousRangeRef.current = isBelowCollapseBreakpoint;
    setCollapsed(isBelowCollapseBreakpoint);
  }, [isBelowCollapseBreakpoint, isMobile, isControlled]);

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
    [isMobile, isCollapsed, mobileState.isOpen],
  );

  if (isMobile) {
    return (
      <SidebarContext.Provider value={context}>
        <Drawer state={mobileState}>
          <Drawer.Backdrop>
            <Drawer.Content placement="left">
              <Drawer.Dialog
                aria-label="Sidebar"
                className={clsx(
                  "flex h-full w-[280px] max-w-[85vw] flex-col",
                  className,
                )}
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
        className={clsx(
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

Sidebar.Header = function SidebarHeader({
  children,
  className,
}: SidebarHeaderProps) {
  return (
    <div
      className={clsx(
        "border-default flex h-14 shrink-0 items-center gap-2 border-b px-3",
        className,
      )}
    >
      {children}
    </div>
  );
};

export interface SidebarBodyProps {
  children: ReactNode;
  className?: string;
}

Sidebar.Body = function SidebarBody({ children, className }: SidebarBodyProps) {
  return (
    <ScrollShadow className="min-h-0 flex-1" orientation="vertical">
      <nav className={clsx("flex flex-col gap-1 p-2", className)}>
        {children}
      </nav>
    </ScrollShadow>
  );
};

export interface SidebarFooterProps {
  children: ReactNode;
  className?: string;
}

Sidebar.Footer = function SidebarFooter({
  children,
  className,
}: SidebarFooterProps) {
  return (
    <div
      className={clsx(
        "border-default mt-auto flex shrink-0 items-center gap-2 border-t px-3 py-3",
        className,
      )}
    >
      {children}
    </div>
  );
};

export interface SidebarItemProps {
  children: ReactNode;
  /** Destination URL. When set, the item renders as a Link. */
  href?: string;
  /** Fired when the item is activated. Ignored when `href` is set and the link navigates. */
  onClick?: () => void;
  icon?: ReactNode;
  isActive?: boolean;
  disabled?: boolean;
  className?: string;
}

Sidebar.Item = function SidebarItem({
  children,
  href,
  onClick,
  icon,
  isActive = false,
  disabled = false,
  className: classNameProp,
}: SidebarItemProps) {
  const { isCollapsed, isMobile, closeMobile } = useSidebar();

  const handleActivate = () => {
    onClick?.();
    if (isMobile) closeMobile();
  };

  const label = (
    <span
      className={clsx(
        "overflow-hidden whitespace-nowrap transition-[opacity,width] duration-300 ease-in-out motion-reduce:transition-none",
        isCollapsed && !isMobile ? "w-0 opacity-0" : "w-full opacity-100",
      )}
    >
      {children}
    </span>
  );

  const className = clsx(
    "w-full group relative flex items-center gap-3 overflow-hidden rounded-xl px-3 py-2 text-sm text-foreground outline-none transition-colors  ",
    "data-[hovered=true]:bg-default data-[pressed=true]:bg-default data-[focus-visible=true]:ring-2 data-[focus-visible=true]:ring-focus ",
    isActive && "bg-default font-medium",
    classNameProp,
  );

  if (href) {
    return (
      <Link
        aria-current={isActive ? "page" : undefined}
        className={clsx(className, "no-underline")}
        href={href}
        isDisabled={disabled}
        onPress={handleActivate}
        render={(props) => {
          const { ref, ...domProps } = props as DetailedHTMLProps<
            AnchorHTMLAttributes<HTMLAnchorElement>,
            HTMLAnchorElement
          >;

          return <NextLink {...domProps} ref={ref} href={href} />;
        }}
      >
        {icon}
        {label}
      </Link>
    );
  }

  return (
    <Button
      aria-current={isActive ? "true" : undefined}
      // - Override HeroUI Button's default `justify-center` so content stays left-aligned;
      //   otherwise it re-centers mid-transition as the sidebar width and label width animate together.
      // - Use `transform-none` to disable the pressed scale transform so this matches the Link branch above,
      //   which has no press animation. Can't use `scale-100`.
      className={clsx(
        className,
        "justify-start text-start active:transform-none data-[pressed]:transform-none",
      )}
      isDisabled={disabled}
      variant="ghost"
      onPress={handleActivate}
    >
      {icon}
      {label}
    </Button>
  );
};

export interface SidebarTriggerProps {
  className?: string;
  "aria-label"?: string;
}

Sidebar.Trigger = function SidebarTrigger({
  className,
  "aria-label": ariaLabel = "Toggle sidebar",
}: SidebarTriggerProps) {
  const { isMobile, toggleMobile, toggleCollapsed } = useSidebar();

  return (
    <Button
      aria-label={ariaLabel}
      className={clsx(className, "shrink-0")}
      isIconOnly
      variant="ghost"
      onPress={isMobile ? toggleMobile : toggleCollapsed}
    >
      <PanelLeftCloseIcon className="h-4.5 w-4.5" />
    </Button>
  );
};

export { useSidebar };
