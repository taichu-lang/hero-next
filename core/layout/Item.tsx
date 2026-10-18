"use client";

import { Button, cn, Link as HeroLink } from "@heroui/react";
import { Link } from "hero-next/i18n/navigation";
import { AnchorHTMLAttributes, createContext, DetailedHTMLProps, ReactNode, useContext } from "react";

interface ItemContextValue {
  isActive: boolean;
}

const ItemContext = createContext<ItemContextValue>({
  isActive: false,
});

function useItemContext() {
  return useContext(ItemContext);
}

export interface ItemProps {
  /** Destination URL. When set, the item renders as a Link. */
  href?: string;
  /** Fired when the item is activated. Ignored when `href` is set and the link navigates. */
  onClick?: () => void;
  icon?: ReactNode;
  isActive?: boolean;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function Item({
  href,
  onClick,
  icon,
  isActive = false,
  disabled = false,
  className: containerStyle,
  children,
}: ItemProps) {
  const handleActivate = () => {
    onClick?.();
  };

  const className = cn(
    "group text-foreground flex w-full gap-3 overflow-hidden rounded-xl px-3 py-2 text-sm transition-colors outline-none",
    "data-[hovered=true]:bg-default data-[pressed=true]:bg-default data-[focus-visible=true]:ring-focus data-[focus-visible=true]:ring-2",
    isActive && "bg-default font-medium",
    containerStyle,
  );

  if (href) {
    return (
      <ItemContext.Provider value={{ isActive }}>
        <HeroLink
          aria-current={isActive ? "page" : undefined}
          className={cn(className, "no-underline")}
          href={href}
          isDisabled={disabled}
          onPress={handleActivate}
          render={(props) => {
            const { ref, ...domProps } = props as DetailedHTMLProps<
              AnchorHTMLAttributes<HTMLAnchorElement>,
              HTMLAnchorElement
            >;

            return <Link {...domProps} ref={ref} href={href} />;
          }}
        >
          {icon}
          {children}
        </HeroLink>
      </ItemContext.Provider>
    );
  }

  return (
    <ItemContext.Provider value={{ isActive }}>
      <Button
        aria-current={isActive ? "true" : undefined}
        // - Override HeroUI Button's default `justify-center` so content stays left-aligned; otherwise it
        //   re-centers mid-transition as the sidebar width and label width animate together.
        // - Use `transform-none` to disable the pressed scale transform so this matches the Link branch above,
        //   which has no press animation. Can't use `scale-100`.
        className={cn(
          className,
          "justify-start text-start active:transform-none data-[pressed]:transform-none",
        )}
        isDisabled={disabled}
        variant="ghost"
        onPress={handleActivate}
      >
        {icon}
        {children}
      </Button>
    </ItemContext.Provider>
  );
}

Item.Content = function ItemContent({
  children,
  className,
  visible = true,
}: {
  children: ReactNode;
  className?: string;
  visible?: boolean;
}) {
  const { isActive } = useItemContext();

  return (
    <div
      className={cn(
        "overflow-hidden whitespace-nowrap transition-[opacity,width] duration-300 ease-in-out motion-reduce:transition-none",
        visible ? "w-full opacity-100" : "hidden opacity-0",
        isActive && "font-medium",
        className,
      )}
    >
      {children}
    </div>
  );
};
