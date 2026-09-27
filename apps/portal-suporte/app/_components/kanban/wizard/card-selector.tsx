import { cn } from '@/lib/utils';

export function CardSelector<T extends string>({
  options,
  value,
  onChange,
  cols = 3,
}: {
  options: { value: T; label: string; emoji: string; desc?: string }[];
  value: T;
  onChange: (v: T) => void;
  cols?: number;
}) {
  return (
    <div className={cn('grid gap-2', cols === 2 ? 'grid-cols-2' : cols === 4 ? 'grid-cols-4' : cols === 5 ? 'grid-cols-3 sm:grid-cols-5' : 'grid-cols-3')}>
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'flex flex-col items-center gap-1 rounded-lg border p-2.5 text-xs transition-all',
            value === o.value
              ? 'border-indigo-500 bg-indigo-900/40 text-indigo-200'
              : 'border-border bg-muted/40 text-muted-foreground/70 hover:border-border hover:text-foreground',
          )}
        >
          <span className="text-lg">{o.emoji}</span>
          <span className="font-medium leading-tight text-center">{o.label}</span>
          {o.desc && <span className="text-[10px] leading-tight text-center opacity-70">{o.desc}</span>}
        </button>
      ))}
    </div>
  );
}
