"use client";

import { Button, ButtonProps } from "@heroui/react";
import { CopyCheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { copyToClipboard } from "../utils";
import { useChatMessageContext } from "./ChatMessageContext";
import { CollectMessageContents } from "./type";

function ActionButton(props: ButtonProps) {
  return <Button isIconOnly variant="ghost" {...props}></Button>;
}

export function ChatMessageCopyAction() {
  const { message } = useChatMessageContext();
  const [copied, setCopied] = useState<boolean>(false);

  if (message.contents.length === 0) {
    return null;
  }

  const handleCopy = async () => {
    if (copied) {
      return;
    }

    const text = CollectMessageContents(message);
    await copyToClipboard(text);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, 2000);
  };

  return (
    <ActionButton onClick={handleCopy}>
      {copied ? <CopyCheckIcon className="text-success h-4.5 w-4.5" /> : <CopyIcon className="h-4.5 w-4.5" />}
    </ActionButton>
  );
}
