import { Label } from '@/components/ui/label';

export function Field({ label, required, hint, children }: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-muted-foreground/50">
        {label}
        {required && <span className="ml-1 text-red-400">*</span>}
        {hint && <span className="ml-2 text-[11px] font-normal text-muted-foreground">{hint}</span>}
      </Label>
      {children}
    </div>
  );
}
