import { Pencil } from 'lucide-react';

export function ReviewRow({ label, value, onEdit }: { label: string; value: string; onEdit?: () => void }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-2 py-1.5 border-b border-border last:border-0">
      <span className="text-xs text-muted-foreground shrink-0 w-28">{label}</span>
      <span className="text-xs text-foreground flex-1 break-words">{value}</span>
      {onEdit && (
        <button type="button" onClick={onEdit} className="text-indigo-400 hover:text-indigo-300 shrink-0">
          <Pencil className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
