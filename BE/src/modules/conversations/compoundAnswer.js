import { createHash } from 'node:crypto';
import { questionParts } from './queryTerms.js';
import { focusedAnswer } from './focusedAnswer.js';
import { sectionAnswer } from './sectionAnswer.js';
import { documentAnswer } from './documentAnswer.js';
import { topicEvidence, notFoundAnswer } from './topicEvidence.js';
import { presentationBlocks } from './presentation.js';

export function compoundAnswer(sources, question) {
  const parts=questionParts(question),answers=parts.map(part=>{
    let answer=focusedAnswer(sources,part)||sectionAnswer(sources,part);
    if(answer?.status!=='answered')answer=documentAnswer(sources,part);
    if(answer?.status!=='answered'||!topicEvidence(part,answer.answer).supported)answer=notFoundAnswer();
    return {part,...answer};
  });
  const blocks=[],seen=new Set(),selected=new Map();
  for(const [index,answer] of answers.entries()) {
    for(const source of answer.sources)selected.set(source.chunkId,source);
    if(parts.length>1)blocks.push({id:`question-part-${index}`,type:'paragraph',text:answer.part,heading:true});
    // Resolve offsets within each answer independently before merging. An earlier
    // answer may contain the same formula; it is not a second occurrence in the PDF.
    for(const block of presentationBlocks(answer.answer,answer.sources)) {
      const key=JSON.stringify([block.type,block.source?.documentId,block.source?.pageFrom,
        (block.source?.anchor||block.text||block.items?.join(' ')||'').replace(/\s/gu,'')]);
      if(block.source&&seen.has(key))continue;
      seen.add(key);
      blocks.push({...block,id:createHash('sha256').update(`${index}:${block.id}`).digest('hex').slice(0,24)});
    }
  }
  return {blocks,sources:[...selected.values()],status:answers.every(answer=>answer.status==='answered')?'answered':'insufficient_context'};
}
