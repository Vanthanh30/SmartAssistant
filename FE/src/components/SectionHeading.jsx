export function SectionHeading({ icon: Icon, eyebrow, title, children }) {
  return <div className="section-heading"><span className="section-heading-icon"><Icon size={23} aria-hidden="true"/></span><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{children}</div></div>;
}
