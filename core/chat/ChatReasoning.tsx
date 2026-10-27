import { Accordion } from "@heroui/react";
import { Loading } from "hero-next/effects";
import { BrainIcon, ChevronDownIcon } from "lucide-react";

// While the model is reasoning: same collapsible shape as ChatReasoning, expanded by default. The body is a
// max-height, non-scrollable window that always shows the newest part of the streamed summary: content is
// bottom-aligned, so overflow is clipped at the top and faded out.
export function ChatReasoningStream({ children }: { children: React.ReactNode }) {
  return (
    <Accordion className="w-full" defaultExpandedKeys={["reasoning"]}>
      <Accordion.Item id="reasoning">
        <Accordion.Heading className="items-center">
          <Accordion.Trigger className="flex min-w-0 items-center justify-start gap-3 rounded-2xl bg-transparent p-0">
            <Loading size="xs" />
            <span className="text-muted text-xs">思考中...</span>
          </Accordion.Trigger>
          <Accordion.Indicator>
            <ChevronDownIcon className="size-4" />
          </Accordion.Indicator>
        </Accordion.Heading>
        <Accordion.Panel>
          <Accordion.Body>
            <div className="border-border mt-2 border-l-2 pl-3">
              <div
                className="text-muted flex max-h-32 flex-col justify-end overflow-hidden text-xs"
                style={{ maskImage: "linear-gradient(to bottom, transparent, black 40%)" }}
              >
                {children}
              </div>
            </div>
          </Accordion.Body>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}

// The finished reasoning summary, collapsed by default.
export function ChatReasoning({ children }: { children: React.ReactNode }) {
  return (
    <Accordion className="w-full">
      <Accordion.Item>
        <Accordion.Heading className="items-center">
          <Accordion.Trigger className="flex min-w-0 items-center justify-start gap-3 rounded-2xl bg-transparent p-0">
            <BrainIcon className="text-muted size-4 shrink-0" />
            <span className="text-muted text-xs">已思考</span>
          </Accordion.Trigger>
          <Accordion.Indicator>
            <ChevronDownIcon className="size-4" />
          </Accordion.Indicator>
        </Accordion.Heading>
        <Accordion.Panel>
          <Accordion.Body>
            <div className="text-muted border-border mt-2 border-l-2 pl-3 text-xs">{children}</div>
          </Accordion.Body>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}
