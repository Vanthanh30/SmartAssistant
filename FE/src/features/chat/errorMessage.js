export function chatErrorMessage(error) {
  const message = typeof error === "string" ? error : error?.message;
  if (
    error?.code === "LLM_QUOTA_EXCEEDED" ||
    /Tài khoản OpenAI đã hết số dư|Billing\/Usage|API key có hạn mức/i.test(
      message || "",
    )
  ) {
    return "Trợ lý AI tạm thời chưa khả dụng. Vui lòng thử lại sau.";
  }
  return message || "Không thể gửi câu hỏi lúc này. Vui lòng thử lại.";
}
