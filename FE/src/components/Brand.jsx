import { Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Brand({ to = '/', compact = false }) {
  return <Link to={to} className="brand" aria-label="Trợ lý học tập — trang chủ">
    <span className="brand-mark"><Sparkles size={23} aria-hidden="true"/></span>
    <span className={`brand-name ${compact ? 'brand-compact' : ''}`}>Trợ lý học tập<small>Không gian học thông minh</small></span>
  </Link>;
}
