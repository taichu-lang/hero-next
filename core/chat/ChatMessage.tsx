"use client";

import clsx from "clsx";
import { ChatMessageCopyAction } from "./Action";
import { ChatAlign, Role } from "./type";

// Overview:
//
// - ChatMessage is the container of messages belonging to one role, ex: user message.
// - ChatBubbleMessage is the actual message bubble, including an optional Metadata component.
//
// Ex:
// - An user message:
//
//   <ChatMessage role="user"><ChatMessageBubble>Hi</ChatMessageBubble></ChatMessage>
//
// - Multi assistant messages, including assistant output, tool calls, final output:
//
//   <ChatMessage role="assistant">
//     <ChatMessageBubble><Markdown>Hello</Markdown></ChatMessageBubble>
//     <ChatMessageBubble><Tool>grep "text" /home</Tool></ChatMessageBubble>
//   </ChatMessage>
//

export type ChatMessageBubbleVariant = "filled" | "ghost";
export type ChatMessageBubbleRadius = "sm" | "md" | "lg";

export interface ChatMessageBubbleProps {
  /**
   * Bubble content — text, Markdown, or any ReactNode.
   */
  children: React.ReactNode;

  /**
   * Visual variant.
   * - 'filled': background color based on sender (default)
   * - 'ghost': no background, but keeps padding for consistent alignment
   * @default 'filled'
   */
  variant?: ChatMessageBubbleVariant;

  radius?: ChatMessageBubbleRadius;
}

export function ChatMessageBubble({
  children,
  variant = "ghost",
  radius = "md",
}: ChatMessageBubbleProps) {
  return (
    <div
      className={clsx("min-w-0 text-sm", {
        "bg-default w-fit max-w-[max(80%,280px)] px-3.5 py-2.5":
          variant === "filled",
        "w-full bg-transparent": variant === "ghost",
        "rounded-lg": radius === "sm",
        "rounded-xl": radius === "md", // 12px
        "rounded-2xl": radius === "lg",
      })}
    >
      {children}
    </div>
  );
}

export interface ChatMessageMetadataProps {
  children?: React.ReactNode;
  spacing?: "sm" | "md" | "lg";
  reveal?: "hover" | "always";
  enableCopy?: boolean;
}

export function ChatMessageMetadata({
  children,
  spacing = "md",
  reveal = "always",
  enableCopy = true,
}: ChatMessageMetadataProps) {
  return (
    <div
      className={clsx(
        "flex items-center",
        { sm: "gap-1", md: "gap-2", lg: "gap-3" }[spacing],
        {
          "opacity-0 transition-opacity duration-150 motion-reduce:transition-none":
            reveal === "hover",
          "group-focus-within/message:opacity-100 group-hover/message:opacity-100":
            reveal === "hover",
          "focus-within:opacity-100 pointer-coarse:opacity-100":
            reveal === "hover",
        },
      )}
    >
      {enableCopy && <ChatMessageCopyAction />}
      {children}
    </div>
  );
}

export interface ChatMessageProps {
  role: Role;
  children: React.ReactNode;
  align?: ChatAlign;
  spacing?: "sm" | "md" | "lg";
}

export function ChatMessage({
  role,
  align,
  spacing = "md",
  children,
}: ChatMessageProps) {
  align = align || (role === "user" ? "end" : "stretch");

  return (
    <div
      role="group"
      className={clsx(
        "group/message flex w-full flex-col text-sm",
        { sm: "gap-1", md: "gap-2", lg: "gap-3" }[spacing],
        {
          "items-start": align === "start",
          "items-end": align === "end",
          "items-stretch": align === "stretch",
        },
      )}
    >
      {children}
    </div>
  );
}
