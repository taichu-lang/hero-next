import clsx from "clsx";

export interface ChatMessageListProps {
  density?: "compact" | "balanced";
  children: React.ReactNode;
}

export function ChatMessageList({
  density = "balanced",
  children,
}: ChatMessageListProps) {
  return (
    <div
      className={clsx("flex min-h-0 w-full flex-col", {
        "gap-2": density === "compact",
        "gap-3": density === "balanced",
      })}
    >
      {children}
    </div>
  );
}
