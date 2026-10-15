import { ProgressCircle } from "@heroui/react";

export function Loading() {
  return (
    <ProgressCircle isIndeterminate aria-label="Loading" size="sm">
      <ProgressCircle.Track>
        <ProgressCircle.TrackCircle />
        <ProgressCircle.FillCircle />
      </ProgressCircle.Track>
    </ProgressCircle>
  );
}
