"use client";

import { TextArea } from "@heroui/react";
import clsx from "clsx";
import { useCallback, useImperativeHandle, useState } from "react";

export interface ChatComposerInputHandler {
  clear: () => void;
}

export interface ChatComposerInputProps {
  disabled?: boolean;
  maxRows?: number;
  placeholder?: string;
  ref?: React.Ref<ChatComposerInputHandler>;
  onChange: (value: string) => void;
}

export function ChatComposerInput({
  disabled,
  maxRows = 4,
  placeholder,
  ref,
  onChange,
}: ChatComposerInputProps) {
  const [value, setValue] = useState<string>("");

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setValue(v);
    onChange(v);
  };

  const clear = useCallback(() => {
    setValue("");
    onChange("");
  }, [onChange]);

  useImperativeHandle(ref, () => ({
    clear,
  }));

  return (
    <TextArea
      placeholder={placeholder}
      rows={maxRows}
      disabled={disabled}
      fullWidth
      value={value}
      onChange={handleChange}
      className={clsx(
        "scrollbar-thin resize-none",
        "bg-transparent shadow-none outline-none",
        "data-[focused=true]:bg-transparent data-[focused=true]:shadow-none data-[focused=true]:ring-0 data-[focused=true]:outline-none",
      )}
      autoFocus={false}
    />
  );
}
