export function scrollToLatestMessage(container, behavior = "smooth") {
  const latest = container?.querySelector(".chat-message:last-child");
  if (!latest) return;
  const top =
    container.scrollTop +
    latest.getBoundingClientRect().top -
    container.getBoundingClientRect().top -
    8;
  container.scrollTo({ top: Math.max(0, top), behavior });
}
