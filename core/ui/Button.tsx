import { ButtonProps as HeroButtonProps, Button as HeroButton } from "@heroui/react";
import { cn, tv } from "@heroui/styles";

// Custom variants layered on top of HeroUI's built-in ones.
const customVariants = tv({
  variants: {
    variant: {
      inverse: "bg-background-inverse text-default hover:bg-background-inverse/80",
    },
  },
});

type CustomVariant = keyof typeof customVariants.variants.variant;

export type ButtonProps = Omit<HeroButtonProps, "variant"> & {
  variant?: HeroButtonProps["variant"] | CustomVariant;
};

function isCustomVariant(variant: ButtonProps["variant"]): variant is CustomVariant {
  return variant != null && variant in customVariants.variants.variant;
}

export function Button({ variant, className, ...props }: ButtonProps) {
  if (isCustomVariant(variant)) {
    // Use primary as the structural base, then override colors with the custom classes.
    return (
      <HeroButton {...props} variant="primary" className={cn(customVariants({ variant }), className)} />
    );
  }
  return <HeroButton {...props} variant={variant} className={className} />;
}
