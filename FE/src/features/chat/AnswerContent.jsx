import { lazy, Suspense, useState, useCallback } from "react";
import { answerBlocks } from "./answerBlocks.js";
import { formulaGroups } from "./formulaGroups.js";
const FormulaImage = lazy(() =>
  import("./FormulaImage.jsx").then((module) => ({
    default: module.FormulaImage,
  })),
);

export function AnswerContent({ content, blocks, citations = [], onCitation }) {
  const [regions,setRegions]=useState({});
  const [readyCrops, setReadyCrops] = useState({});
  const onCropReady = useCallback((key, ready) => setReadyCrops(previous =>
    previous[key] === ready ? previous : { ...previous, [key]: ready }), []);
  const onRegion=useCallback((id,region)=>setRegions(previous=>JSON.stringify(previous[id])===JSON.stringify(region)?previous:{...previous,[id]:region}),[]);
  const ordered =
    blocks ||
    answerBlocks(content).map((block, index) => {
      const anchor = block.text || block.items?.join("\n") || "";
      const compact = (text) => text.normalize("NFC").replace(/\s/gu, "");
      const matches = citations.filter((citation) =>
        compact(citation.excerpt || "").includes(compact(anchor)),
      );
      // Old messages have no verified per-formula offsets. Unique snapshot matching only.
      const citation = matches.length === 1 ? matches[0] : null;
      return {
        ...block,
        id: `legacy-${index}`,
        type: block.type === "formula" ? "formula_image" : block.type,
        ...(citation
          ? { source: { ...citation, anchor, prefix: "", suffix: "" } }
          : {}),
      };
    });
  const groups = formulaGroups(ordered, regions);
  return (
    <div className="answer-content">
      {ordered.map((block, blockIndex) => {
        const term = "(?:[A-Za-z]+|[0-9]+(?:[.,][0-9]+)?)";
        const expression = term + "(?:\\s*[.·×*+\\-]\\s*" + term + ")*";
        const simple =
          block.text &&
          new RegExp("^" + expression + "\\s*=\\s*" + expression + "$").test(
            block.text,
          ) &&
          !/[Δδ^_²³⁰-⁹₀-₉\uFFFD\uE000-\uF8FF]/.test(block.text) &&
          !/\b[A-Za-z]\s+\d|\b\d\s+[A-Za-z]/.test(block.text);
        const verified =
          block.source &&
          citations.some(
            (item) =>
              item.chunkId === block.source.chunkId &&
              item.documentId === block.source.documentId &&
              (item.excerpt || "")
                .replace(/\s/gu, "")
                .includes((block.text || "").replace(/\s/gu, "")),
          );
        if (
          block.type === "formula_text" ||
          (block.type === "formula_image" && simple && verified)
        )
          return (
            <div key={block.id} className="answer-formula">
              {block.text}
            </div>
          );
        if (block.type === "formula_image") {
          const citation =
            block.source &&
            citations.find(
              (item) =>
                item.documentId === block.source.documentId &&
                item.chunkId === block.source.chunkId,
            );
          if (!citation) return <p key={block.id} className="hint">Không xác minh được vị trí công thức này trong nguồn.</p>;
          const region=regions[block.id];
          const group = groups[block.id];
          const duplicate=region && ordered.slice(0,blockIndex).some(previous=>{
            const other=regions[previous.id];
            return other && other.documentId===region.documentId && other.page===region.page
              && ['left','top','width','height'].every(key=>Math.abs(other[key]-region[key])<3);
          });
          const target = {
            ...citation,
            pageFrom: block.source.pageFrom,
            pageTo: block.source.pageTo,
          };
          return (
            <Suspense
              key={block.id}
              fallback={<p role="status">Đang tải vùng công thức tại đây…</p>}
            >
              <FormulaImage
                citation={target}
                block={block}
                question={block.text}
                onOpen={onCitation}
                onRegion={onRegion}
                mergedRegion={group?.leader === block.id ? group.region : undefined}
                cropKey={group?.leader === block.id ? group.key : undefined}
                onCropReady={onCropReady}
                duplicate={!!duplicate || !!(group && group.leader !== block.id && readyCrops[group.key])}
              />
            </Suspense>
          );
        }
        if (block.type === "list")
          return (
            <ul key={block.id}>
              {block.items.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          );
        if (block.type === "heading" || block.heading)
          return <h4 key={block.id}>{block.text}</h4>;
        if (block.type === "formula_text")
          return (
            <div key={block.id} className="answer-formula">
              {block.text}
            </div>
          );
        return <p key={block.id}>{block.text}</p>;
      })}
    </div>
  );
}
