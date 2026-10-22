import { ProgressCircle, ProgressCircleRootProps } from "@heroui/react";

export interface LoadingProps extends Omit<ProgressCircleRootProps, "size"> {
  size?: "xs" | "sm" | "md" | "lg";
}

export function Loading({ size = "sm", ...props }: LoadingProps) {
  const circleSize = size === "xs" ? "sm" : size;

  return (
    <ProgressCircle isIndeterminate aria-label="Loading" size={circleSize} {...props}>
      <ProgressCircle.Track className={size === "xs" ? "size-3.5" : ""}>
        <ProgressCircle.TrackCircle />
        <ProgressCircle.FillCircle />
      </ProgressCircle.Track>
    </ProgressCircle>
  );
}
