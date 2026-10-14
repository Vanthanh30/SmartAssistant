import { Button } from './ui/Button.jsx';
export function StatusPanel({ title, children, retry }) {
  return <section className="status-panel" aria-live="polite"><h1>{title}</h1>{children}{retry && <Button onClick={retry}>Thử lại</Button>}</section>;
}
