export function Button({ variant, className = '', type = 'button', ...props }) {
  return <button type={type} className={`${variant === 'primary' ? 'primary' : ''} ${className}`.trim()} {...props}/>;
}
