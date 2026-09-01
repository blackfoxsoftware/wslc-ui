import { useEffect, useState } from 'react'
import type { CommandResult } from '@shared/schemas'
import { AppSheet, Skeleton } from '@/design'

interface Props {
  title: string
  description?: string
  load: () => Promise<CommandResult>
  onClose: () => void
}

/** Formata a saída do inspect: JSON identado quando possível, texto cru caso contrário. */
export function prettyInspect(res: CommandResult): string {
  if (!res.ok) return res.stderr || res.stdout || 'Falha ao inspecionar.'
  try {
    return JSON.stringify(JSON.parse(res.stdout), null, 2)
  } catch {
    return res.stdout || '(sem saída)'
  }
}

/** Painel lateral genérico com a saída de `inspect`. */
export default function InspectSheet({ title, description, load, onClose }: Props): React.JSX.Element {
  const [content, setContent] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    load()
      .then((res) => !cancelled && setContent(prettyInspect(res)))
      .catch((e) => !cancelled && setContent(String(e)))
    return () => {
      cancelled = true
    }
    // oxlint-disable-next-line react/exhaustive-effect-dependencies, react-hooks/exhaustive-deps -- carrega uma vez ao abrir
  }, [])

  return (
    <AppSheet
      bodyClassName="overflow-auto"
      description={description}
      title={title}
      width="w-[min(38rem,92vw)]"
      onClose={onClose}
    >
      {content === null ? (
        <div className="flex flex-col gap-2 pt-1">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      ) : (
        <pre className="inset-well overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed">
          {content}
        </pre>
      )}
    </AppSheet>
  )
}
