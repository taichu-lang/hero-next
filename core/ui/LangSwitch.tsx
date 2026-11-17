"use client";

import { Button, cn, Dropdown, DropdownPopoverProps, Label, Selection } from "@heroui/react";
import { LanguagesIcon } from "lucide-react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { usePathname } from "../../i18n/navigation";
import { Locales, LocalSymbols } from "../../i18n/routing";
import { DropdownItemEnd } from "../layout";

export function LangSwitchDropdown({
  className,
  placement = "bottom start",
}: {
  className?: string;
  placement?: DropdownPopoverProps["placement"];
}) {
  const locale = useLocale();
  const router = useRouter();
  const path = usePathname();

  const switchLocale = (selected: Selection) => {
    const [key] = selected;
    if (key) {
      router.push(`/${key}/${path}`);
    }
  };

  return (
    <Dropdown>
      <Button
        className={
          "hover:bg-default-hover flex h-8 min-w-16 items-center justify-start gap-3 rounded-lg px-2 text-sm"
        }
        autoFocus={false}
        variant="ghost"
      >
        <LanguagesIcon className="size-3.5" />
        {LocalSymbols[locale].flag}
      </Button>
      <Dropdown.Popover placement={placement} className={cn("min-w-30", className)}>
        <Dropdown.Menu selectedKeys={[locale]} selectionMode="single" onSelectionChange={switchLocale}>
          {Locales.map((l) => (
            <DropdownItemEnd key={l} id={l} textValue={LocalSymbols[l].name}>
              <Label>{LocalSymbols[l].name}</Label>
            </DropdownItemEnd>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
