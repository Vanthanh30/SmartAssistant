const fold = (value) =>
  value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/giu, "d")
    .toLowerCase();
export function isPracticeIntent(question) {
  return /(?:tao|cho|lam|muon|can|hay|giup|kiem tra|on tap|luyen tap).*(?:cau hoi|bai tap|quiz|flashcard|luyen tap)|^(?:quiz|flashcards?|luyen tap|kiem tra toi)\b/u.test(
    fold(question),
  );
}
export function practiceTopic(question, messages = []) {
  const explicit = question.match(
    /(?:về|chủ đề)\s+(.+?)(?:\s*[,;]\s*\d+\s*câu)?[.!?]*$/iu,
  )?.[1];
  if (explicit && !/^(?:nó|đó|này)$/iu.test(explicit.trim()))
    return explicit.trim();
  const facets =
    "(?:công thức|cách dùng|dấu hiệu nhận biết|định nghĩa|khái niệm|đặc điểm|ứng dụng|ví dụ)";
  for (const message of [...messages].reverse()) {
    if (message.role !== "user" || isPracticeIntent(message.content)) continue;
    let topic = message.content.trim().replace(/[.!?]+$/u, "");
    if (/(?:^|\s)(?:nó|đó|này)(?:\s|$)/iu.test(topic)) continue;
    topic = topic
      .replace(
        new RegExp("\\s+" + facets + "(?:\\s+và\\s+" + facets + ")*$", "iu"),
        "",
      )
      .replace(
        new RegExp(
          "^" + facets + "(?:\\s+và\\s+" + facets + ")*(?:\\s+của)?\\s+",
          "iu",
        ),
        "",
      )
      .replace(/\s+là gì$/iu, "")
      .trim();
    if (topic.length <= 150 && !/\s(?:và|hay|hoặc)\s/iu.test(topic))
      return topic;
    return "";
  }
  return "";
}

export function recentPracticeTopics(messages = []) {
  const topics = [];
  for (const message of messages
    .filter((item) => item.role === "user")
    .slice(-12)
    .reverse()) {
    if (
      isPracticeIntent(message.content) ||
      /^(?:cho(?: tôi| mình)? |lấy |nêu )?(?:ví dụ|giải thích thêm|nói rõ hơn)[.!?]*$/iu.test(
        message.content.trim(),
      )
    )
      continue;
    const topic = practiceTopic("luyện tập", [message]);
    if (
      !topic ||
      topic.split(/\s+/u).length < 2 ||
      /^(?:công thức|cách dùng|dấu hiệu nhận biết)$/iu.test(topic)
    )
      continue;
    if (!topics.some((item) => fold(item) === fold(topic))) topics.push(topic);
    if (topics.length === 3) break;
  }
  return topics;
}
