'use client';

import React from 'react';

export function Chip({ icon, label, value, className = '' }: {
  icon?: React.ReactNode;
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground/60 shadow-xs ${className}`}>
      {icon}
      <span>{label}</span>
      <span className="ml-0.5 font-bold">{value}</span>
    </div>
  );
}
