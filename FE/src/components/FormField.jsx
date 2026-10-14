export function FormField({ label, id, error, children }) {
  return <div className="field"><label htmlFor={id}>{label}</label>{children}
    {error && <p className="field-error" id={`${id}-error`} role="alert">{error}</p>}</div>;
}
