import { answerBlocks } from './answerBlocks.js';

export function AnswerContent({ content, hasSources = false, formulaImageReady = false }) {
  const blocks = answerBlocks(content);
  const hasFormula = blocks.some((block) => block.type === "formula");
  return (
    <div className="answer-content">
      {blocks.map((block, index) => {
        if (block.type === "list")
          return (
            <ul key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{item}</li>
              ))}
            </ul>
          );
        if (block.type === "heading") return <h4 key={index}>{block.text}</h4>;
        if (block.type === "formula")
          return formulaImageReady ? null : (
            <div
              className="answer-formula"
              key={index}
              aria-label="Công thức trong tài liệu"
            >
              {block.text}
            </div>
          );
        return <p key={index}>{block.text}</p>;
      })}
      {hasSources && hasFormula && (
        <p className="answer-source-note">
          {formulaImageReady ? 'Công thức nguyên bản được hiển thị trong ảnh bên dưới.' : 'Giữ nội dung công thức trích xuất để đối chiếu; nếu ảnh không tải được, mở đúng trang PDF bằng nút nguồn bên dưới.'}
        </p>
      )}
    </div>
  );
}
