export type Role = "user" | "assistant";

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

export type MessageContent = TextContent | UsageContent;

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
