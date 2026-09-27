"use client"

import { useEffect, useState } from "react"
import { BookOpen, ChevronRight, Loader2, Sparkles } from "lucide-react"
import Link from "next/link"
import { kbApi } from "@/lib/api/kb"

interface Article {
  id: string
  title: string
  slug?: string
  category: string | null
  score?: number
  excerpt?: string
}

interface KbSuggestionsProps {
  query: string
  className?: string
}

export function KbSuggestions({ query, className = '' }: KbSuggestionsProps) {
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading]   = useState(false)
  const [semantic, setSemantic] = useState(false)

  useEffect(() => {
    if (!query.trim()) return
    let cancelled = false
    setLoading(true)
    setSemantic(false)

    kbApi.suggest(query, 5)
      .then(data => {
        if (cancelled) return
        const articles = ((data as any).data ?? data).articles
        if (articles?.length) {
          setArticles(articles)
          setSemantic(true)
        } else {
          return kbApi.list({ q: query, limit: '5' })
            .then(d => { if (!cancelled) setArticles(((d as any).data ?? d).articles ?? []) })
        }
      })
      .catch(() => { if (!cancelled) setArticles([]) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [query])

  if (!loading && articles.length === 0) return null

  return (
    <div className={`rounded-lg border bg-sem-warning border-sem-warning-bd p-3 ${className}`}>
      <div className="flex items-center gap-1.5 mb-2">
        <BookOpen className="h-3.5 w-3.5 text-sem-warning-fg" />
        <span className="text-xs font-semibold text-sem-warning-fg">Base de Conhecimento</span>
        {semantic && !loading && (
          <span className="ml-auto flex items-center gap-0.5 text-[10px] text-sem-warning-fg">
            <Sparkles className="h-2.5 w-2.5" /> semântico
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-1.5 text-sem-warning-fg text-xs">
          <Loader2 className="h-3 w-3 animate-spin" /> Buscando artigos…
        </div>
      ) : (
        <ul className="space-y-1.5">
          {articles.map(a => (
            <li key={a.id}>
              <Link
                href={`/admin/kb?open=${a.id}`}
                className="group flex items-start gap-1 text-xs text-sem-warning-fg hover:text-sem-warning-fg"
              >
                <ChevronRight className="h-3 w-3 shrink-0 mt-0.5 group-hover:translate-x-0.5 transition-transform" />
                <div className="min-w-0">
                  <span className="hover:underline truncate block">{a.title}</span>
                  {a.excerpt && (
                    <span className="text-[10px] text-sem-warning-fg line-clamp-1">{a.excerpt}</span>
                  )}
                </div>
                {a.score != null && (
                  <span className="ml-auto shrink-0 text-[10px] text-amber-500 tabular-nums">
                    {Math.round(a.score * 100)}%
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
