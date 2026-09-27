"use client";

import { cn } from "@/lib/utils";

export interface SegmentedControlOption<T extends string> {
  id: T;
  label: React.ReactNode;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  fullWidth?: boolean;
  className?: string;
}

/**
 * Grupo de botões estilo toggle/segmented (uma opção ativa por vez).
 * Usado em: groupBy do Kanban (desktop + mobile), SortBar (desktop + mobile).
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "sm",
  fullWidth = false,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      className={cn(
        "inline-flex rounded-md border border-border overflow-hidden",
        fullWidth && "w-full",
        className
      )}
    >
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          aria-pressed={value === opt.id}
          className={cn(
            "text-xs font-medium border-r last:border-r-0 border-border transition-colors",
            fullWidth && "flex-1",
            size === "sm" ? "h-7 px-2.5" : "h-8 px-3",
            fullWidth && "h-9",
            value === opt.id
              ? "bg-foreground text-background"
              : "bg-background text-foreground/60 hover:bg-muted/50"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
