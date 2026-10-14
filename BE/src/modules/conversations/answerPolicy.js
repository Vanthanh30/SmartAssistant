import { AppError } from '../../shared/AppError.js';
import { retrievalService, CHAT_RETRIEVAL_CANDIDATES } from '../../rag/retrieval.js';
import { documentAnswer } from './documentAnswer.js';
import { sectionAnswer } from './sectionAnswer.js';
import { expandContext } from './context.js';
import { conversationRepository } from './repository.js';

// Select existing grounded/extractive/general paths without owning quota or persistence.
export function answerPolicy(db, config, provider) {
  return async ({ owner, conversation, id, input, answerMode }) => {
    let sources;
    const requiresDocuments = answerMode === 'documents' || !!input.documentIds || /\bpdf\b|tài liệu|nguồn trích|trang\s+\d+/i.test(input.question);
    try { sources = answerMode === 'general' && !requiresDocuments ? [] : await retrievalService(db, { ...config, RAG_TIMEOUT_MS: Math.min(config.RAG_TIMEOUT_MS, 30000) })(owner, String(conversation.course_id), input.question, CHAT_RETRIEVAL_CANDIDATES, input.documentIds); }
    catch (error) {
      if (error.code === 'DOCUMENT_SCOPE_TOO_LARGE') throw new AppError(422, error.code, 'Tập nguồn quá lớn để truy hồi trong một lượt. Hãy chọn ít PDF hơn.');
      throw new AppError(error.code === 'RAG_INVALID_INPUT' ? 422 : 503, 'RETRIEVAL_UNAVAILABLE', 'Không thể truy hồi nguồn. Kiểm tra RAG service/index hoặc rút ngắn câu hỏi.');
    }
    sources = sources.filter(s => Number.isFinite(s.score) && s.score >= config.RAG_SCORE_THRESHOLD && (!input.documentIds || input.documentIds.includes(s.documentId)));
    const started = Date.now();
    const hadRetrievedSources = sources.length > 0;
    sources = await expandContext(db, owner, String(conversation.course_id), sources, config.RAG_TOP_K);
    if (hadRetrievedSources && !sources.length) throw new AppError(409, 'SOURCE_CHANGED', 'Nguồn đã thay đổi trong lúc mở rộng context. Hãy gửi lại câu hỏi.');
    let result;
    if (sources.length) {
      if (config.OPENAI_API_KEY && config.LLM_MODEL && config.LLM_MODEL_CONTEXT_TOKENS) {
        const [turns] = await conversationRepository(db).recentTurns( [id]);
        result = await provider.answer(input.question, sources, turns.reverse(), async context => {
          const ids = [...new Set(context.map(s => s.chunkId))];
          const [current] = await conversationRepository(db).verifyContext(ids, owner, conversation.course_id);
          if (current.length !== ids.length) throw new AppError(409, 'SOURCE_CHANGED', 'Nguồn đã thay đổi trong lúc chuẩn bị câu trả lời.');
        });
      } else {
        const budget = config.LLM_CONTEXT_BUDGET_TOKENS;
        const groupedQuestion = /bao nhiêu|những|các loại|từng loại|liệt kê|gồm|chức năng|cấu tạo|quá trình|các bước|phân loại|nêu tên/i.test(input.question);
        result = groupedQuestion && sources.some(s => s.contextIncomplete)
          ? { status: 'insufficient_context', model: 'document-extractive', sources,
            answer: 'Phần truy hồi có thể chưa trọn nhóm ý. Hãy mở trang nguồn để đối chiếu; hệ thống chưa thể khẳng định đã liệt kê đầy đủ.' }
          : sectionAnswer(sources, input.question, budget) || documentAnswer(sources, input.question, budget);
      }
    }
    if (!result) result = requiresDocuments || sources.length
      ? { status: 'insufficient_context', model: 'document-extractive', sources: [], answer: 'Chưa đủ thông tin trong tài liệu được chọn để trả lời câu hỏi. Hãy hỏi cụ thể hơn hoặc mở PDF để đối chiếu.' }
      : await provider.generalAnswer(input.question);
    return { result: { ...result, answerOrigin: !requiresDocuments && !sources.length ? 'general' : 'grounded' }, started };
  };
}
