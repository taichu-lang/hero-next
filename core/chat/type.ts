// user: message from user input.
// assistant: message from llm, ex: tool call.
// tool: tool result.
export type Role = "user" | "assistant" | "tool";

export type ChatAlign = "start" | "end" | "stretch";

export interface TextContent {
  type: "text";
  text: string;
}

export interface UsageContent {
  type: "usage";
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

export interface ToolCallContent {
  type: "tool_call";
  id: string;
  name: string;
  arguments: string;
  result?: string; // Assign when the corresponding ToolResultContent is received.
}

export interface ToolResultContent {
  type: "tool_result";
  tool_call_id: string; // mapping to ToolCallContent.id
  name: string;
  result: string;
}

// The reasoning summary of the model. While streaming, `summary` grows with each llm.reasoning.delta;
// llm.complete delivers the full summary.
export interface ReasoningContent {
  type: "reasoning";
  id: string;
  summary: string;
}

export type MessageContent =
  TextContent | UsageContent | ToolCallContent | ToolResultContent | ReasoningContent;

export interface BaseMessage {
  id: string;
  role: Role;
  contents: MessageContent[];
}

export interface Message extends BaseMessage {
  interrupted?: boolean;
  hasError?: boolean;
}

// Key fields:
// npx skills add <source> --skill <name>
export type Skill = {
  name: string;
  description: string;
  source: string;
  version?: string;
  installation?: string;
};

export function CollectMessageContents(message: BaseMessage): string {
  return message.contents
    .filter((content) => content.type === "text")
    .map((content) => content.text)
    .join("");
}

// A tool call card renders a call and its result together, but the protocol delivers them as separate
// contents: ToolCallContent on an assistant message, ToolResultContent on a later tool message. These helpers
// attach each result to the call with the matching id.

/**
 * Attach every ToolResultContent to the ToolCallContent with the matching id, and drop the merged tool-result
 * contents — along with any message left empty — from the list. A result without a matching call is kept as-is.
 */
export function MergeToolCallResults<M extends BaseMessage>(messages: M[]): M[] {
  const calls = new Set<string>();
  const results = new Map<string, string>();
  for (const message of messages) {
    for (const content of message.contents) {
      if (content.type === "tool_call") {
        calls.add(content.id);
      } else if (content.type === "tool_result" && !results.has(content.tool_call_id)) {
        results.set(content.tool_call_id, content.result);
      }
    }
  }

  if (results.size === 0) {
    return messages;
  }

  return messages.flatMap((message): M[] => {
    const contents = message.contents.flatMap((content): MessageContent[] => {
      if (content.type === "tool_call") {
        const result = results.get(content.id);
        return result === undefined || content.result !== undefined ? [content] : [{ ...content, result }];
      }
      // Drop the result only when its call is in the list and therefore carries it now.
      if (content.type === "tool_result" && calls.has(content.tool_call_id)) {
        return [];
      }
      return [content];
    });

    return contents.length === 0 ? [] : [{ ...message, contents } as M];
  });
}

/**
 * The streaming variant of MergeToolCallResults: attach newly arrived results to the matching calls already in
 * the list. Returns null when no call matched, so the caller can skip the state update.
 */
export function ApplyToolCallResults<M extends BaseMessage>(
  messages: M[],
  results: ToolResultContent[],
): M[] | null {
  if (results.length === 0) {
    return null;
  }

  const pending = new Map(results.map((content) => [content.tool_call_id, content.result]));

  let changed = false;
  const next = messages.map((message) => {
    // Keep the identity of untouched messages, so the virtualized list does not re-render them.
    if (!message.contents.some((content) => content.type === "tool_call" && pending.has(content.id))) {
      return message;
    }

    return {
      ...message,
      contents: message.contents.map((content) => {
        if (content.type === "tool_call" && content.result === undefined) {
          const result = pending.get(content.id);
          if (result !== undefined) {
            changed = true;
            return { ...content, result };
          }
        }
        return content;
      }),
    } as M;
  });

  return changed ? next : null;
}
