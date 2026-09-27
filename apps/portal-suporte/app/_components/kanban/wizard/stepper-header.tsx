import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const STEPS = [
  { label: 'Empresa & Contato' },
  { label: 'Tipo & Prioridade' },
  { label: 'Contexto Op.' },
  { label: 'Descrição' },
  { label: 'Anexos' },
  { label: 'SLA & Agenda' },
  { label: 'Revisão & Envio' },
];

export function StepperHeader({ current }: { current: number }) {
  return (
    <div className="flex items-start justify-between px-1">
      {STEPS.map((step, idx) => {
        const done   = idx < current;
        const active = idx === current;
        const future = idx > current;
        return (
          <div key={idx} className="flex flex-1 flex-col items-center gap-1">
            {/* Line connector */}
            <div className="flex w-full items-center">
              {idx > 0 && (
                <div className={cn('h-0.5 flex-1', done || active ? 'bg-indigo-500' : 'bg-muted')} />
              )}
              <div
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                  done   && 'bg-indigo-600 text-white',
                  active && 'bg-indigo-600 text-white ring-2 ring-indigo-400 ring-offset-2 ring-offset-slate-900',
                  future && 'bg-muted text-muted-foreground/70',
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : idx + 1}
              </div>
              {idx < STEPS.length - 1 && (
                <div className={cn('h-0.5 flex-1', done ? 'bg-indigo-500' : 'bg-muted')} />
              )}
            </div>
            {/* Label */}
            <span className={cn(
              'text-center text-[10px] leading-tight',
              active ? 'text-indigo-300 font-medium' : done ? 'text-muted-foreground/70' : 'text-foreground/60',
            )}>
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
