"use client";

import { Button, cn, Dropdown, Label, Selection } from "@heroui/react";
import { MoonIcon, SunIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useTheme } from "./useTheme";

export interface ThemeSwitchDropdownProps {
  placement?: React.ComponentProps<typeof Dropdown.Popover>["placement"];

  className?: string;
}

export function ThemeSwitchDropdown({ placement = "top start", className }: ThemeSwitchDropdownProps) {
  const t = useTranslations();
  const { isDark, mounted, setTheme } = useTheme();
  const [open, setOpen] = useState<boolean>(false);

  if (!mounted) {
    return null;
  }

  const switchTheme = (selection: Selection) => {
    const [key] = selection;
    console.log(key);
    if (key) {
      setTheme(key.toString());
    }
  };

  return (
    <Dropdown isOpen={open} onOpenChange={setOpen}>
      <Button
        className={cn(
          "hover:bg-default-hover flex h-8 min-w-40 items-center justify-start gap-3 rounded-lg px-2 text-sm",
          className,
        )}
        autoFocus={false}
        variant="ghost"
      >
        {isDark ? (
          <>
            <MoonIcon className="size-3.5" />
            {t("theme.dark")}
          </>
        ) : (
          <>
            <SunIcon className="size-3.5" />
            {t("theme.light")}
          </>
        )}
      </Button>
      <Dropdown.Popover placement={placement} className={cn("min-w-40", className)}>
        <Dropdown.Menu
          selectedKeys={[isDark ? "dark" : "light"]}
          selectionMode="single"
          onSelectionChange={switchTheme}
        >
          <Dropdown.Item id="light" textValue={t("theme.light")}>
            <SunIcon className="size-3.5" />
            <Label>{t("theme.light")}</Label>
          </Dropdown.Item>
          <Dropdown.Item id="dark" textValue={t("theme.dark")}>
            <MoonIcon className="size-3.5" />
            <Label>{t("theme.dark")}</Label>
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
