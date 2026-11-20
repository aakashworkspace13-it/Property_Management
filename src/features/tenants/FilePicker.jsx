import { checkUpload } from '../../lib/tenants.js'

// Picks one or more photos/PDFs. "Take photo" opens the camera on phones; "Choose file"
// opens the gallery / file browser. Shows chosen files with a remove button.
export default function FilePicker({ label, hint, files, onChange, multiple = true }) {
  function add(event) {
    const picked = [...(event.target.files ?? [])]
    event.target.value = ''
    const next = multiple ? [...files, ...picked] : picked.slice(0, 1)
    onChange(next)
  }

  return (
    <div className="file-picker">
      <span className="field-label">{label}</span>
      {hint && <span className="muted small">{hint}</span>}
      <div className="form-actions">
        <label className="button small-button">
          Take photo
          <input type="file" accept="image/*" capture="environment" onChange={add} hidden />
        </label>
        <label className="button small-button">
          Choose file
          <input type="file" accept="image/jpeg,image/png,application/pdf" multiple={multiple} onChange={add} hidden />
        </label>
      </div>
      {files.length > 0 && (
        <ul className="file-list">
          {files.map((f, i) => {
            const problem = checkUpload(f)
            return (
              <li key={`${f.name}-${i}`}>
                <span>
                  {f.name} <span className="muted small">({Math.max(1, Math.round(f.size / 1024))} KB)</span>
                  {problem && <span className="error small"> — {problem}</span>}
                </span>
                <button type="button" className="link-button" onClick={() => onChange(files.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
