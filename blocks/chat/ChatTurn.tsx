"use client";

import { Typography } from "@heroui/react";
import { cn } from "@heroui/styles";
import {
  ChatReasoning,
  ChatReasoningStream,
  Message,
  MessageBubble,
  Turn,
  TurnBubble,
  TurnBubbleMetadata,
  TurnContextProvider,
} from "hero-next/chat";
import { HammerIcon } from "lucide-react";
import { memo } from "react";
import { Streamdown } from "streamdown";
import { ChatToolCalls } from "./ChatToolCalls";

/**
 * One turn: everything the agent did for one user input.
 *
 * The messages are grouped and each group is one ChatMessage with its own metadata: every user
 * message has one (copy that message), while all the assistant messages of the turn share a
 * single one at the end (copy the whole reply), shown once the turn is settled.
 */
export const ChatTurn = memo(function ChatTurn({
  turn,
  draft = null,
}: {
  turn: Turn;

  /**
   * The assistant message still being generated; only meaningful while running.
   */
  draft?: Message | null;
}) {
  const messages = turn.messages;
  const firstAssistant = messages.findIndex((m) => m.role !== "user");
  const separator = firstAssistant === -1 ? messages.length : firstAssistant;
  const assistants = messages.slice(separator);

  return (
    <TurnContextProvider turn={turn}>
      {messages.slice(0, separator).map((m) => (
        <UserMessage key={m.id} message={m} />
      ))}

      {/* Immutable assistant messages. */}
      {assistants.length > 0 && (
        <TurnBubble role="assistant" messages={assistants}>
          {assistants.map((m) => (
            <AssistantContents key={m.id} message={m} />
          ))}

          {turn.status !== "running" && <TurnBubbleMetadata enableTurnInfo={true} />}
        </TurnBubble>
      )}

      {draft && <AssistantContents message={draft} streaming />}
    </TurnContextProvider>
  );
});

function UserMessage({ message }: { message: Message }) {
  return (
    <TurnBubble role="user" messages={[message]}>
      <MessageBubble variant="filled" radius="lg">
        {message.contents.map((c, idx) =>
          c.type === "text" ? <Markdown key={`${message.id}-${idx}`}>{c.text}</Markdown> : null,
        )}
      </MessageBubble>
      <TurnBubbleMetadata reveal="hover" />
    </TurnBubble>
  );
}

function AssistantContents({ message, streaming = false }: { message: Message; streaming?: boolean }) {
  const { id, contents } = message;
  return contents.map((c, idx) => {
    switch (c.type) {
      case "text":
        return (
          <MessageBubble key={`${id}-${idx}`}>
            <Markdown isAnimating={streaming}>{c.text}</Markdown>
          </MessageBubble>
        );

      case "reasoning":
        return streaming ? (
          <ChatReasoningStream key={c.id}>
            <Markdown isAnimating>{c.summary}</Markdown>
          </ChatReasoningStream>
        ) : (
          <ChatReasoning key={c.id}>
            <Markdown>{c.summary}</Markdown>
          </ChatReasoning>
        );

      case "tool_call":
        return <ChatToolCalls key={c.id} {...c} />;

      default:
        return null;
    }
  });
}

function Markdown({ children, isAnimating }: { children: string; isAnimating?: boolean }) {
  return (
    <Streamdown
      controls={false}
      linkSafety={{ enabled: false }}
      isAnimating={isAnimating}
      // Heading overrides replace streamdown's own heading components, so heading rhythm is set here
      // and not inherited: room above (section break), tight below (title belongs to its content).
      // Code blocks opt out of streamdown's default line numbers — the counter classes only render
      // once its dist is scanned (see hero-next core/styles/base.css @source), and chat code reads
      // cleaner without them, like HeroUI prose code.
      lineNumbers={false}
      allowedTags={{
        // id, name are default tags.
        skill: ["source"],
      }}
      components={{
        h1: ({ children, ref, className }) => (
          <Typography type="h1" ref={ref} className={cn(className, "mt-8 mb-3 text-2xl")} data-markdown="h1">
            {children}
          </Typography>
        ),
        h2: ({ children, ref, className }) => (
          <Typography type="h2" ref={ref} className={cn(className, "mt-6 mb-2 text-xl")} data-markdown="h2">
            {children}
          </Typography>
        ),
        h3: ({ children, ref, className }) => (
          <Typography type="h3" ref={ref} className={cn(className, "mt-6 mb-2 text-lg")} data-markdown="h3">
            {children}
          </Typography>
        ),
        // _temp5: `key` is not a prop.
        p: ({ children, ref, className }) => (
          <Typography type="body-sm" ref={ref} className={className} data-markdown="p">
            {children}
          </Typography>
        ),
        skill: ({ name, source }) => {
          return (
            <a
              href={source as string}
              className="text-warning hover:outline-warning mx-1 inline-flex items-center gap-0.5 rounded-full px-1.5 -outline-offset-1 hover:outline"
              target="_blank"
            >
              <HammerIcon className="size-3.5" />
              {name as string}
            </a>
          );
        },
      }}
    >
      {children}
    </Streamdown>
  );
}
