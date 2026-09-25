export type Role = "user" | "assistant";

export type ChatAlign = "start" | "end" | "stretch";

export interface Message {
  message_id: string;
  role: Role;
  content: string;
}
