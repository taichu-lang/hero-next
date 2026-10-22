import { Accordion, Chip } from "@heroui/react";
import { Loading } from "hero-next/effects";
import { ChevronDownIcon, CircleCheckBigIcon } from "lucide-react";

interface ToolCallProps {
  name: string;
  result?: string;
  Icon: React.ElementType;
  cmd: string;
}

export function ChatToolCall({ name, result, Icon, cmd }: ToolCallProps) {
  return (
    <Accordion className={"w-full"}>
      <Accordion.Item>
        <Accordion.Heading className="items-center">
          {/* p-0 is align with Skill tool */}
          <Accordion.Trigger
            className={"flex min-w-0 items-center justify-start gap-3 rounded-2xl bg-transparent p-0"}
          >
            {result ? <CircleCheckBigIcon className="text-success size-4 shrink-0" /> : <Loading />}
            <Chip color="accent">
              <Icon className="text-warning size-4" />
              <Chip.Label>{name}</Chip.Label>
            </Chip>
            <p className="text-muted mr-10 min-w-0 truncate text-xs">{cmd}</p>
          </Accordion.Trigger>
          <Accordion.Indicator>
            <ChevronDownIcon className="size-4" />
          </Accordion.Indicator>
        </Accordion.Heading>
        <Accordion.Panel>
          <Accordion.Body>
            <div className="divide-border bg-background border-border mt-2 divide-y overflow-hidden rounded-lg border font-mono text-sm">
              <div className="flex gap-3 px-3 py-2">
                <span className="text-muted w-9 shrink-0">IN</span>
                <pre className="min-w-0 flex-1 overflow-y-auto whitespace-pre-wrap">{cmd}</pre>
              </div>
              <div className="flex gap-3 px-3 py-2">
                <span className="text-muted w-9 shrink-0">OUT</span>
                <pre className="text-muted min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap">{result}</pre>
              </div>
            </div>
          </Accordion.Body>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}
