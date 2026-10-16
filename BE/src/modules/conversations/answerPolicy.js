import { focusedAnswer } from './focusedAnswer.js';
import { log } from '../../config/logger.js';
import { AppError } from '../../shared/AppError.js';
import { retrievalService, CHAT_RETRIEVAL_CANDIDATES } from '../../rag/retrieval.js';
import { documentAnswer } from './documentAnswer.js';
import { sectionAnswer } from './sectionAnswer.js';
import { expandContext } from './context.js';

// Local document answers only; service owns quota, transactions and persistence.
export function answerPolicy(db, config) {
  return async ({ owner, conversation, input, answerMode }) => {
    let sources;
    const requiresDocuments = answerMode === 'documents' || !!input.documentIds || /\bpdf\b|tài liệu|nguồn trích|trang\s+\d+/i.test(input.question);
    if (answerMode === 'general' && !requiresDocuments) return { started: Date.now(), result: { status: 'insufficient_context', model: 'document-extractive', answerOrigin: 'unknown', sources: [], answer: 'Hỏi đáp đang dùng tài liệu nội bộ, không gọi LLM/API key. Chế độ kiến thức chung không khả dụng; hãy hỏi từ PDF đã tải lên.' } };
    try { sources = await retrievalService(db, config)(owner, String(conversation.course_id), input.question, CHAT_RETRIEVAL_CANDIDATES, input.documentIds); }
    catch (error) {
      if (error.code === 'DOCUMENT_SCOPE_TOO_LARGE') throw new AppError(422, error.code, 'Tập nguồn quá lớn để truy hồi trong một lượt. Hãy chọn ít PDF hơn.');
      const messages = {
        RAG_TIMEOUT: 'Truy hồi tài liệu quá thời gian chờ. Model có thể đang tải lần đầu hoặc dịch vụ đang bận; hãy thử lại.',
        RAG_CONNECTION_FAILED: 'Không kết nối được dịch vụ truy hồi. Khởi động BE bằng npm run dev để chạy cả API, worker và RAG.',
        RAG_UNAUTHORIZED: 'Cấu hình kết nối API và RAG chưa khớp. Kiểm tra service token ở backend, không phải OpenAI API key.',
        INDEX_VERSION_MISMATCH: 'Index tài liệu đã thay đổi trong lúc truy hồi. Hãy gửi lại yêu cầu mới.',
        RAG_INVALID_INPUT: 'Dịch vụ truy hồi không chấp nhận yêu cầu hoặc index hiện tại. Cần kiểm tra log RAG.',
        RAG_INVALID_RESPONSE: 'Dịch vụ truy hồi trả dữ liệu không hợp lệ. Cần kiểm tra phiên bản API và RAG.',
      };
      log('api', 'retrieval-failed', { code: messages[error.code] ? error.code : 'RAG_UNAVAILABLE' });
      throw new AppError(error.code === 'RAG_INVALID_INPUT' ? 422 : 503, messages[error.code] ? error.code : 'RETRIEVAL_UNAVAILABLE', messages[error.code] || 'Dịch vụ truy hồi chưa xử lý được tài liệu. Kiểm tra log RAG và thử lại.');
    }
    sources = sources.filter(s => Number.isFinite(s.score) && s.score >= config.RAG_SCORE_THRESHOLD && (!input.documentIds || input.documentIds.includes(s.documentId)));
    const started = Date.now();
    const hadRetrievedSources = sources.length > 0;
    sources = await expandContext(db, owner, String(conversation.course_id), sources, config.RAG_TOP_K);
    if (hadRetrievedSources && !sources.length) throw new AppError(409, 'SOURCE_CHANGED', 'Nguồn đã thay đổi trong lúc mở rộng context. Hãy gửi lại câu hỏi.');
    let result;
    if (sources.length) {
      const multipleTopics = /\s(?:và|đồng thời|cũng như)\s/i.test(input.question);
      const focus = focusedAnswer(sources,input.question);
      const section = focus || (multipleTopics ? null : sectionAnswer(sources, input.question));
      // Return all matching passages from the verified retrieval scope; no LLM token budget.
      // Explicitly retain the section-completeness warning instead of claiming a full list.
      const passages = !focus && (!section || section.status !== 'answered')
        ? documentAnswer(sources, input.question) : null;
      result = section?.status === 'answered' ? section : passages;
      if (section?.status === 'insufficient_context' && passages?.status === 'answered') {
        result = { ...passages, status: 'insufficient_context', answer: passages.answer + '\n\n' + section.answer };
      }
      if (!result) result = section;

    }
    if (!result) result = { status: 'insufficient_context', model: 'document-extractive', sources: [], answer: 'Chưa đủ thông tin trong tài liệu để trả lời. Hệ thống không gọi OpenAI hoặc dùng kiến thức ngoài PDF; hãy hỏi cụ thể hơn hoặc mở nguồn để đối chiếu.' };
    return { result: { ...result, answerOrigin: 'grounded' }, started };
  };
}
