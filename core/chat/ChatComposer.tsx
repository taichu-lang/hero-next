"use client";

import { Button, ButtonProps } from "@heroui/react";
import clsx from "clsx";
import { ArrowUpIcon, CircleXIcon, TriangleAlertIcon } from "lucide-react";
import { useRef, useState } from "react";
import {
  ChatComposerInput,
  ChatComposerInputHandler,
} from "./ChatComposerInput";

interface ComposerStatus {
  type: "error" | "warning";
  message: string;
}

export interface ChatComposerProps {
  /**
   * The drawer content, such as the uploaded files, manual confirmation, etc.
   */
  drawer?: React.ReactNode;

  elevation?: "none" | "low";

  /**
   * Slot: left-aligned header actions (attach, mention buttons). Icon-only buttons are preferred.
   */
  headerActions?: React.ReactNode;

  /**
   * Slot: right-aligned contextual info in the header (context window usage, progress bar).
   */
  headerContext?: React.ReactNode;

  /**
   * Slot: left-aligned footer actions (model selector, skills selector, etc).
   * Note that the right area has the send button by default.
   */
  footActions?: React.ReactNode;

  disabled?: boolean;

  streaming?: boolean;

  status?: ComposerStatus;

  onSubmit: (value: string) => void;
}

// TODO(Leo): add collapsed state.
function ChatComposerDrawer({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col px-4 py-3">
      <div className="flex h-5 w-full cursor-pointer justify-center">
        <div className="bg-background-inverse/80 h-0.5 w-4 rounded-full"></div>
      </div>
      <div className="flex flex-wrap">{children}</div>
    </div>
  );
}

function ChatComposerStatus({ type, message }: ComposerStatus) {
  const warning = type === "warning";
  const error = type === "error";

  return (
    <div
      className={clsx(
        "-mt-7 flex items-center gap-2 rounded-b-3xl px-4 pt-10 pb-3 text-xs",
        {
          "bg-warning-soft text-warning-soft-foreground": warning,
          "bg-danger-soft text-danger-soft-foreground": error,
        },
      )}
    >
      {warning && (
        <TriangleAlertIcon className="text-warning-soft-foreground h-4 w-4" />
      )}
      {error && <CircleXIcon className="text-danger-soft-foreground h-4 w-4" />}
      {message}
    </div>
  );
}

const radius = "rounded-3xl";

export function ChatComposer({
  elevation = "low",
  drawer,
  headerActions,
  headerContext,
  footActions,
  status,
  disabled = false,
  onSubmit,
}: ChatComposerProps) {
  const [text, setText] = useState<string>("");
  const inputRef = useRef<ChatComposerInputHandler>(null);

  const handleSend = () => {
    onSubmit(text);
    inputRef.current?.clear();
  };

  return (
    <div
      className={clsx("ring-default flex w-full flex-col ring-1", radius, {})}
    >
      {drawer && <ChatComposerDrawer>{drawer}</ChatComposerDrawer>}
      <div
        className={clsx(
          "ring-default bg-background z-2 flex flex-1 flex-col gap-2 p-3 ring-1",
          radius,
          {
            "outline-segment shadow-lg hover:outline": elevation === "low",
            "shadow-none": elevation === "none",
          },
        )}
      >
        <div className="flex min-h-0 items-center">
          {headerActions}
          <div className="flex-1" />
          {headerContext}
        </div>
        <ChatComposerInput onChange={setText} ref={inputRef} />
        <div className="flex min-h-0 items-center">
          {footActions}
          <div className="flex-1" />
          <ChatComposeButton
            variant="primary"
            onClick={handleSend}
            isDisabled={!text || disabled}
          >
            <ArrowUpIcon className="h-4 w-4" />
          </ChatComposeButton>
        </div>
      </div>
      {status && <ChatComposerStatus {...status} />}
    </div>
  );
}

/**
 * ChatComposeButton declares the preferred button for actions in ChatComposer.
 */
export function ChatComposeButton({
  variant = "ghost",
  ...props
}: Omit<ButtonProps, "size">) {
  return <Button isIconOnly size="sm" variant={variant} {...props} />;
}
