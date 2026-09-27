interface AdminHeaderProps {
  user?: { id: string; email: string; role: string } | null
  title?: string
  description?: string
}

// Admin navigation is now handled by AdminSidebar in app/(admin)/admin/layout.tsx
export function AdminHeader(_props: AdminHeaderProps) {
  return null
}
