'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Building2, ChevronsUpDown } from 'lucide-react';

export function CompanyCombobox({ value, onChange, companies }: {
  value: string;
  onChange: (v: string) => void;
  companies: string[];
}) {
  const [open, setOpen] = useState(false);
  const label = value === 'all' ? 'Todas as empresas' : value;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-8 w-48 justify-between border-border bg-background px-2.5 text-sm font-normal text-foreground/80 hover:bg-muted/50"
        >
          <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
          <span className="mx-1.5 flex-1 truncate text-left">{label}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar empresa..." className="h-8 text-sm" />
          <CommandList>
            <CommandEmpty>Nenhuma empresa encontrada.</CommandEmpty>
            <CommandItem
              value="all"
              onSelect={() => { onChange('all'); setOpen(false); }}
              className="text-sm"
            >
              Todas as empresas
            </CommandItem>
            {companies.map((c: string) => (
              <CommandItem
                key={c}
                value={c}
                onSelect={() => { onChange(c); setOpen(false); }}
                className="text-sm"
              >
                {c}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
