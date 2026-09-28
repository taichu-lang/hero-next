export type Role = "user" | "assistant";

export type ChatAlign = "start" | "end" | "stretch";

export interface Message {
  message_id: string;
  role: Role;
  content: string;
  interrupted?: boolean;
  hasError?: boolean;
}

export type ResponseChunkType = "delta" | "final" | "done";

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

export interface ResponseChunk {
  id: string;
  type: ResponseChunkType;
  role: Role;
  contents: MessageContent[];
}
