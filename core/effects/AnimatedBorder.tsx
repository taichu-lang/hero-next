import { cn } from "@heroui/styles";

export function AnimatedBorder({
  children,
  borderWidth = 2,
  duration = 2,
  className,
}: {
  children: React.ReactNode;
  borderWidth?: number;
  duration?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(className)}
      style={{
        animation: `rotate-border ${duration}s linear infinite`,
        border: `${borderWidth}px solid transparent`,
        /* The conic-gradient creates a fan-shaped sweep effect, while a linear-gradient is used as a mask */
        /* to obscure the central area. */
        background: `
            conic-gradient(
                from var(--border-angle),
                transparent 0%,
                color-mix(in oklab, var(--accent-foreground) 20%, transparent) 40%,
                color-mix(in oklab, var(--accent-foreground) 60%, transparent) 65%,
                var(--accent-foreground) 85%,
                transparent 92%
            )
            border-box
        `,
      }}
    >
      {children}
    </div>
  );
}
