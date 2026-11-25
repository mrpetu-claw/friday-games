import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Two-step button: the first click asks inline ("End for everyone?  Yes / Cancel"),
 * the second confirms. Replaces window.confirm, which some browsers block.
 */
export function ConfirmButton({
  children,
  question,
  confirmLabel,
  onConfirm,
  className = 'btn',
  confirmClassName = 'btn btn-danger',
  disabled,
}: {
  children: ReactNode
  question: string
  confirmLabel: string
  onConfirm: () => void
  className?: string
  confirmClassName?: string
  disabled?: boolean
}) {
  const [asking, setAsking] = useState(false)
  const yesRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!asking) return
    yesRef.current?.focus()
    const t = window.setTimeout(() => setAsking(false), 8000) // step back if left alone
    return () => window.clearTimeout(t)
  }, [asking])

  if (!asking) {
    return (
      <button type="button" className={className} disabled={disabled} onClick={() => setAsking(true)}>
        {children}
      </button>
    )
  }
  return (
    <span className="confirm" role="group" aria-label={question}>
      <span className="confirm-q">{question}</span>
      <button
        ref={yesRef}
        type="button"
        className={confirmClassName}
        onClick={() => {
          setAsking(false)
          onConfirm()
        }}
      >
        {confirmLabel}
      </button>
      <button type="button" className="btn btn-small" onClick={() => setAsking(false)} onKeyDown={(e) => e.key === 'Escape' && setAsking(false)}>
        Cancel
      </button>
    </span>
  )
}
