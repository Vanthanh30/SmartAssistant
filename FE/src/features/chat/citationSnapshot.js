export function assertCitationSnapshot(citation,current) {
  if(String(current.documentId)!==String(citation.documentId)||String(current.chunkId)!==String(citation.chunkId)||current.content!==citation.excerpt)throw new Error('Nội dung nguồn đã thay đổi sau lượt trả lời này. Vui lòng đối chiếu đoạn trích đã lưu trong lịch sử.');
}
