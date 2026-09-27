"use client"

import { useEffect } from "react"

export type ToastState = { message: string; type: "success" | "error" } | null

/** Toast fixo no rodapé, auto-fecha em 4s. Fonte única de feedback de ação. */
export function Toast({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(onClose, 4000)
    return () => clearTimeout(t)
  }, [toast, onClose])

  if (!toast) return null
  const isError = toast.type === "error"

  return (
    <div
      role="alert"
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 text-white text-sm font-medium px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 ${
        isError ? "bg-red-600" : "bg-emerald-600"
      }`}
    >
      {isError ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
      )}
      {toast.message}
    </div>
  )
}
