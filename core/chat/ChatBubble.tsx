"use client";

import { cn } from "@heroui/styles";
import { createContext, useContext } from "react";
import { ChatTurnInfoAction, TurnBubbleCopyAction } from "./Metadata";
import { ChatAlign, Message, Role } from "./type";

export type MessageBubbleVariant = "filled" | "ghost";
export type MessageBubbleRadius = "sm" | "md" | "lg";

export interface MessageBubbleProps {
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
  variant?: MessageBubbleVariant;

  radius?: MessageBubbleRadius;
}

// MessageBubble is the container of one message (user, assistant, or tool).
export function MessageBubble({ children, variant = "ghost", radius = "md" }: MessageBubbleProps) {
  return (
    <div
      className={cn("min-w-0 text-sm", {
        "bg-default w-fit max-w-[max(80%,280px)] px-3.5 py-2.5": variant === "filled",
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

export interface TurnBubbleMetadataProps {
  children?: React.ReactNode;
  spacing?: "sm" | "md" | "lg";
  reveal?: "hover" | "always";
  enableCopy?: boolean;
  enableTurnInfo?: boolean;
}

export function TurnBubbleMetadata({
  children,
  spacing = "md",
  reveal = "always",
  enableCopy = true,
  enableTurnInfo = false,
}: TurnBubbleMetadataProps) {
  return (
    <div
      className={cn("flex items-center", { sm: "gap-1", md: "gap-2", lg: "gap-3" }[spacing], {
        "opacity-0 transition-opacity duration-150 motion-reduce:transition-none": reveal === "hover",
        "group-focus-within/message:opacity-100 group-hover/message:opacity-100": reveal === "hover",
        "focus-within:opacity-100 pointer-coarse:opacity-100": reveal === "hover",
      })}
    >
      {enableCopy && <TurnBubbleCopyAction />}
      {enableTurnInfo && <ChatTurnInfoAction />}
      {children}
    </div>
  );
}

export interface TurnBubbleProps {
  role: Role;
  children: React.ReactNode;
  align?: ChatAlign;
  spacing?: "sm" | "md" | "lg";
  messages: Message[];
}

interface TurnBubbleContextValue {
  role: Role;
  messages: Message[];
}

const TurnBubbleContext = createContext<TurnBubbleContextValue | null>(null);

export function useTurnBubbleContext() {
  const ctx = useContext(TurnBubbleContext);
  if (!ctx) {
    throw new Error("useTurnBubbleContext must be used within a TurnBubble");
  }

  return ctx;
}

// TurnBubble is the container of messages in one turn (user or assistant).
export function TurnBubble({ role, align, spacing = "md", children, messages }: TurnBubbleProps) {
  align = align || (role === "user" ? "end" : "stretch");

  return (
    <div
      role="group"
      // pb-x: gap between messages.
      // gap-x: gap between bubble and metadata.
      className={cn(
        "group/message mb-2 flex w-full flex-col text-sm",
        { sm: "gap-1", md: "gap-2", lg: "gap-3" }[spacing],
        {
          "items-start": align === "start",
          "items-end": align === "end",
          "items-stretch": align === "stretch",
        },
      )}
    >
      <TurnBubbleContext.Provider value={{ role, messages }}>{children}</TurnBubbleContext.Provider>
    </div>
  );
}
