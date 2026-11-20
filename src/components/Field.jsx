// A labelled form field with an optional hint and error message.
export default function Field({ label, error, hint, required, children }) {
  return (
    <label className={error ? 'field has-error' : 'field'}>
      <span className="field-label">
        {label}
        {required && <span className="required" aria-hidden="true"> *</span>}
      </span>
      {children}
      {hint && !error && <span className="muted small">{hint}</span>}
      {error && <span className="error small">{error}</span>}
    </label>
  )
}
