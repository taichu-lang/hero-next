"use client";

import { Button, ButtonProps, cn } from "@heroui/react";
import { ArrowUpIcon, CircleXIcon, SquareIcon, TriangleAlertIcon } from "lucide-react";
import { Suspense } from "react";
import {
  ChatComposerInput,
  ChatComposerProvider,
  ChatComposerValue,
  useChatComposer,
} from "./ChatComposerInput";
import { useChatContext } from "./ChatContext";

interface ComposerStatus {
  type: "error" | "warning";
  message: string;
}

export interface ChatComposerProps {
  /**
   * The drawer content, such as the uploaded files, manual confirmation, etc.
   * You can use ChatComposerDrawer to wrap the content.
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

  /**
   * Slot: right-aligned contextual info in the footer (ex: model preference).
   * Note that the right area has the send button by default.
   */
  footContext?: React.ReactNode;

  /**
   * Disable any interaction with the composer. Ex: no permission.
   */
  disabled?: boolean;

  statusBar?: ComposerStatus;

  input?: { placeholder?: string };

  /**
   * Called with the current input value on submit. The request's AbortController is not passed
   * here: it lives in ChatContext (beginRequest/cancelRequest), whose lifetime is the chat page
   * rather than this composer, so the cancel button keeps working even when the request was
   * started by a composer instance that has since unmounted.
   */
  onSubmit: (value: ChatComposerValue) => void;
}

// TODO(Leo): add collapsed state.
export function ChatComposerDrawer({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    // Padding is same as EditorContent.
    <div className="flex flex-col px-3 py-1.5">
      <div className="flex h-5 w-full cursor-pointer justify-center">
        <div className="bg-background-inverse/80 h-0.5 w-4 rounded-full"></div>
      </div>
      <div className={cn("flex flex-wrap", className)}>{children}</div>
    </div>
  );
}

function ChatComposerStatus({ type, message }: ComposerStatus) {
  const warning = type === "warning";
  const error = type === "error";

  return (
    <div
      className={cn("-mt-7 flex items-center gap-2 rounded-b-3xl px-4 pt-10 pb-3 text-xs", {
        "bg-warning-soft text-warning-soft-foreground": warning,
        "bg-danger-soft text-danger-soft-foreground": error,
      })}
    >
      {warning && <TriangleAlertIcon className="text-warning-soft-foreground h-4 w-4" />}
      {error && <CircleXIcon className="text-danger-soft-foreground h-4 w-4" />}
      {message}
    </div>
  );
}

const radius = "rounded-3xl";

export function ChatComposer({ disabled = false, input, onSubmit, ...props }: ChatComposerProps) {
  return (
    // Tiptap's `useEditor` reads `Math.random()` during render, which Next.js refuses to
    // prerender; the Suspense boundary streams the editor in at request time instead.
    <Suspense fallback={<div className={cn("bg-background-secondary h-28 w-full shadow-inner", radius)} />}>
      <ChatComposerProvider disabled={disabled} placeholder={input?.placeholder} onSubmit={onSubmit}>
        <ChatComposerLayout disabled={disabled} {...props} />
      </ChatComposerProvider>
    </Suspense>
  );
}

function ChatComposerLayout({
  elevation = "low",
  drawer,
  headerActions,
  headerContext,
  footActions,
  footContext,
  statusBar,
  disabled,
}: Omit<ChatComposerProps, "input" | "onSubmit">) {
  const { isEmpty, submit } = useChatComposer();
  // Cancel comes from ChatContext, not from the composer provider: the controller of the
  // in-flight request is registered there by the request sender, so this button aborts the
  // current conversation's request regardless of which composer instance started it.
  const { status, cancelRequest } = useChatContext();

  return (
    <div className={cn("bg-background-secondary flex w-full flex-col shadow-inner", radius)}>
      {/* Do not wrap drawer in ChatComposerDrawer by default, as it might be a component that returns null. */}
      {/* Padding is same as input area. */}
      {drawer && <div className="px-3">{drawer}</div>}
      {/* This area should cover part of ChatComposerStatus. */}
      <div
        className={cn("bg-background-secondary z-10 flex flex-1 flex-col gap-2 p-3", radius, {
          "hover:outline-segment hover:outline": elevation === "low",
          "shadow-none": elevation === "none",
        })}
      >
        <div className="flex min-h-0 items-center gap-2">
          {headerActions}
          <div className="flex-1" />
          {headerContext}
        </div>
        <ChatComposerInput />
        <div className="flex min-h-0 items-center gap-2">
          {footActions}
          <div className="flex-1" />
          {footContext}
          {status === "idle" ? (
            <ChatComposeButton variant="primary" onClick={submit} isDisabled={isEmpty || disabled}>
              <ArrowUpIcon className="size-4" />
            </ChatComposeButton>
          ) : (
            <ChatComposeButton variant="danger" onClick={cancelRequest}>
              <SquareIcon className="size-4" />
            </ChatComposeButton>
          )}
        </div>
      </div>
      {statusBar && <ChatComposerStatus {...statusBar} />}
    </div>
  );
}

/**
 * ChatComposeButton declares the preferred button for actions in ChatComposer.
 */
export function ChatComposeButton({ variant = "ghost", ...props }: Omit<ButtonProps, "size">) {
  return <Button isIconOnly size="sm" variant={variant} {...props} />;
}
