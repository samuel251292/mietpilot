import { cloneElement, isValidElement, type ButtonHTMLAttributes, type ReactElement } from "react";
import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  asChild?: boolean;
};

export function Button({ className, variant = "primary", asChild, children, ...props }: ButtonProps) {
  const variants = {
    primary: "bg-blue-700 text-white hover:bg-blue-800 border-blue-700",
    secondary: "bg-white text-navy-900 hover:bg-navy-50 border-navy-200",
    ghost: "bg-transparent text-navy-700 hover:bg-navy-50 border-transparent",
    danger: "bg-red-600 text-white hover:bg-red-700 border-red-600",
  };

  const classes = cn(
    "inline-flex h-10 items-center justify-center gap-2 rounded-md border px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
    variants[variant],
    className,
  );

  if (asChild && isValidElement(children)) {
    const child = children as ReactElement<{ className?: string }>;
    return cloneElement(child, { className: cn(classes, child.props.className) });
  }

  return (
    <button
      className={classes}
      {...props}
    >
      {children}
    </button>
  );
}
