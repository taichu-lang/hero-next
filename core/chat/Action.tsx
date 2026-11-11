"use client";

import { Button, ButtonProps, Popover } from "@heroui/react";
import { CopyCheckIcon, CopyIcon, InfoIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { copyToClipboard } from "../utils";
import { useTurnBubbleContext } from "./ChatBubble";
import { useTurnContext } from "./TurnContext";
import { CollectMessagesText } from "./type";

export function ActionButton(props: ButtonProps) {
  return <Button isIconOnly variant="ghost" {...props} size="sm"></Button>;
}

export function TurnBubbleCopyAction() {
  const { messages } = useTurnBubbleContext();
  const [copied, setCopied] = useState<boolean>(false);

  const text = CollectMessagesText(messages);
  if (!text) {
    return null;
  }

  const handleCopy = async () => {
    if (copied) {
      return;
    }

    await copyToClipboard(text);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, 2000);
  };

  return (
    <ActionButton onClick={handleCopy}>
      {copied ? <CopyCheckIcon className="text-success size-4" /> : <CopyIcon className="text-muted size-4" />}
    </ActionButton>
  );
}

export function ChatTurnInfoAction() {
  const t = useTranslations();
  const { turn } = useTurnContext();

  // Placeholder detail view: the raw turn fields for now. Token cost, MCP usage etc. extend this
  // panel once the turns table carries them.
  const rows: { key: string; label: string; value: string }[] = [
    { key: "status", label: t("chat.action.status"), value: turn.status },
    { key: "iterations", label: t("chat.action.iterations"), value: String(turn.iterations ?? 0) },
    { key: "tokensUsed", label: t("chat.action.tokensUsed"), value: String(turn.tokens_used ?? 0) },
    { key: "turn", label: t("chat.action.turn"), value: `#${turn.turn_seq}` },
  ];
  if (turn.created_at) {
    rows.push({
      key: "start",
      label: t("chat.action.start"),
      value: new Date(turn.created_at * 1000).toLocaleString(),
    });
  }
  if (turn.updated_at) {
    rows.push({
      key: "end",
      label: t("chat.action.end"),
      value: new Date(turn.updated_at * 1000).toLocaleString(),
    });
  }

  return (
    <Popover>
      <ActionButton aria-label={t("chat.action.turnInfoLabel")}>
        <InfoIcon className="text-muted size-4" />
      </ActionButton>
      <Popover.Content className="min-w-48" placement="top left">
        <Popover.Dialog>
          <Popover.Heading>{t("chat.action.dialogTitle")}</Popover.Heading>
          <dl className="mt-3 space-y-1.5 text-xs">
            {rows.map(({ key, label, value }) => (
              <div key={key} className="flex items-center justify-between gap-8">
                <dt className="text-muted">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
