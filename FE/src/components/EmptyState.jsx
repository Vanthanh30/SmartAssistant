import { BookOpen } from 'lucide-react';
export function EmptyState({ title, children }) { return <section className="empty-state" aria-live="polite"><span className="empty-icon"><BookOpen size={30} aria-hidden="true"/></span><h3>{title}</h3>{children}</section>; }
