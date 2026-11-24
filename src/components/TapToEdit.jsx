import { useState } from 'react'

/**
 * Keeps a rarely used Edit button out of sight: tapping the heading (or label) it belongs to
 * shows the button next to it; tapping again hides it. A faint ✎ hints that it can be tapped.
 * `children` must not contain links or buttons (it is itself a button).
 */
export default function TapToEdit({ children, onEdit, label = 'Edit', as: Tag = 'div', className = '' }) {
  const [open, setOpen] = useState(false)
  return (
    <Tag className={`tap-edit ${className}`}>
      <button type="button" className="tap-edit-target" aria-expanded={open} onClick={() => setOpen(!open)}>
        {children}
        <span className="tap-edit-hint" aria-hidden="true">
          ✎
        </span>
      </button>
      {open && (
        <button
          type="button"
          className="button small-button"
          onClick={() => {
            setOpen(false)
            onEdit()
          }}
        >
          {label}
        </button>
      )}
    </Tag>
  )
}
