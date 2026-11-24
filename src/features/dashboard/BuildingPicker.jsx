import { useEffect, useRef, useState } from 'react'

/**
 * One dropdown to choose the buildings the Dashboard shows: "All buildings", or tick one or more.
 * `value`: chosen building codes ([] = all).
 */
export default function BuildingPicker({ buildings, value, onChange }) {
  const [open, setOpen] = useState(false)
  const box = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const close = (e) => {
      if (!box.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  const label =
    value.length === 0
      ? 'All buildings'
      : value.length === 1
        ? buildings.find((b) => b.code === value[0])?.name ?? value[0]
        : `${value.length} buildings`
  const toggle = (code) => onChange(value.includes(code) ? value.filter((x) => x !== code) : [...value, code])

  return (
    <div className="picker" ref={box}>
      <button type="button" className="picker-button" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>{label}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="picker-menu" role="listbox" aria-multiselectable="true">
          <label className="picker-option">
            <input
              type="checkbox"
              checked={value.length === 0}
              onChange={() => {
                onChange([])
                setOpen(false)
              }}
            />
            All buildings
          </label>
          {buildings.map((b) => (
            <label key={b.code} className="picker-option">
              <input type="checkbox" checked={value.includes(b.code)} onChange={() => toggle(b.code)} />
              {b.name}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
