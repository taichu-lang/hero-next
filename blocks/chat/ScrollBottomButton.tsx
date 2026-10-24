"use client";

import { Button } from "@heroui/react";
import { useChatContext } from "hero-next/chat";
import { AnimatedBorder } from "hero-next/effects";
import { ArrowDown } from "lucide-react";

function ButtonContainer({ children }: { children: React.ReactNode }) {
  const { streamingMessage } = useChatContext();

  if (streamingMessage) {
    return (
      <AnimatedBorder className="mx-auto mb-2 flex w-fit rounded-full" borderWidth={1.5}>
        {children}
      </AnimatedBorder>
    );
  }

  return <div className="mx-auto mb-2 flex w-fit">{children}</div>;
}

export function ScrollBottomButton({ onClick, visible }: { onClick: () => void; visible: boolean }) {
  if (!visible) {
    return null;
  }

  return (
    <ButtonContainer>
      <Button isIconOnly onClick={onClick} className={"bg-accent/60 hover:bg-accent-hover backdrop-blur-md"}>
        <ArrowDown className="text-muted size-4" />
      </Button>
    </ButtonContainer>
  );
}
