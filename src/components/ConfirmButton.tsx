import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Button that opens an in-page confirmation dialog (native <dialog>, so focus is
 * trapped, Escape closes and focus returns to the trigger). Cancel is focused by
 * default; the confirm button names the action. Works where window.confirm is blocked.
 */
export function ConfirmButton({
  children,
  title,
  body,
  confirmLabel,
  onConfirm,
  className = 'btn',
  danger = true,
  disabled,
}: {
  children: ReactNode
  title: string
  body?: string
  confirmLabel: string
  onConfirm: () => void
  className?: string
  danger?: boolean
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    if (open && !d.open) {
      d.showModal()
      cancelRef.current?.focus()
    }
    if (!open && d.open) d.close()
  }, [open])

  const close = () => {
    setOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <>
      <button ref={triggerRef} type="button" className={className} disabled={disabled} onClick={() => setOpen(true)}>
        {children}
      </button>
      <dialog
        ref={dialogRef}
        className="confirm-dialog"
        aria-labelledby={undefined}
        onCancel={(e) => {
          e.preventDefault()
          close()
        }}
        onClick={(e) => {
          if (e.target === dialogRef.current) close() // click on the backdrop
        }}
      >
        <h2>{title}</h2>
        {body && <p>{body}</p>}
        <div className="confirm-actions">
          <button ref={cancelRef} type="button" className="btn" onClick={close}>
            Cancel
          </button>
          <button
            type="button"
            className={danger ? 'btn btn-danger-solid' : 'btn btn-primary'}
            onClick={() => {
              close()
              onConfirm()
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </dialog>
    </>
  )
}
