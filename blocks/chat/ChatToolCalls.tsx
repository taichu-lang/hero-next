import { Chip } from "@heroui/react";
import { ChatToolCall, ToolCallContent } from "hero-next/chat";
import { CircleCheckBigIcon, HammerIcon, TerminalIcon } from "lucide-react";

interface SkillToolInput {
  name: string;
}

interface ExecCommandInput {
  cmd: string;
}

function SkillTool({ name, arguments: args }: ToolCallContent) {
  const input = JSON.parse(args) as SkillToolInput;
  return (
    <div className="flex items-center gap-3">
      <CircleCheckBigIcon className="text-success size-4 shrink-0" />
      <Chip color="accent">
        <HammerIcon className="text-warning size-4" />
        <Chip.Label>{name}</Chip.Label>
      </Chip>
      <p className="text-muted text-xs">{input.name}</p>
    </div>
  );
}

function ExecCommandTool({ name, arguments: args, result }: ToolCallContent) {
  const input = JSON.parse(args) as ExecCommandInput;
  return <ChatToolCall name={name} result={result} cmd={input.cmd} Icon={TerminalIcon} />;
}

export function ChatToolCalls({ name, ...props }: ToolCallContent) {
  switch (name) {
    case "skill":
      return <SkillTool name={name} {...props} />;
    case "exec-command":
      return <ExecCommandTool name={name} {...props} />;
    default:
      return null;
  }
}
