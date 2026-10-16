import { cleanDocumentText, formatPassage } from './documentAnswer.js';
const fold=text=>text.normalize('NFD').replace(/\p{M}/gu,'').replace(/đ/g,'d').toLowerCase();
const stop=new Set('la gi cua va cac nhung mot trong ve cho toi hay ban the nao tai sao duoc trinh bay neu giai thich cong thuc'.split(' '));
const terms=text=>[...new Set((fold(text).match(/[a-z0-9]+/g)||[]).filter(word=>!stop.has(word)))];
const heading=text=>/^(?:\d+(?:\.\d+)*[.)]\s*|[a-z][.)]\s*|[IVX]+[.)]\s*|BÀI\s|CHƯƠNG\s)/u.test(text);
// Select named topic sections, not every paragraph sharing a generic word.
export function focusedAnswer(sources,question) {
  const topics=question.split(/\s+(?:và|đồng thời|cũng như)\s+|[;?]|,(?=\s*\p{L})/iu).map(terms).filter(topic=>topic.length);
  if(!topics.length) return null;
  const sections=[];
  for(const chunks of Map.groupBy(sources,source=>source.documentId).values()) {
    const ordered=[...chunks].sort((a,b)=>a.chunkOrder-b.chunkOrder);
    let combined=''; const spans=[];
    for(const source of ordered) {
      const text=cleanDocumentText(source.content); let overlap=0;
      for(let n=Math.min(combined.length,text.length,1800);n>=40;n--) if(combined.endsWith(text.slice(0,n))) {overlap=n;break;}
      const start=combined.length-overlap; combined+=(overlap?'':'\n')+text.slice(overlap);
      spans.push({source,start,end:combined.length});
    }
    const lines=[...combined.matchAll(/[^\n]+/g)];
    for(let i=0;i<lines.length;i++) {
      const title=lines[i][0].trim(); if(!heading(title)) continue;
      let end=i+1;
      // A named sub-section stops at the next sibling; a numbered parent retains its children.
      const child=/^[a-z][.)]/.test(title);
      while(end<lines.length && (!heading(lines[end][0].trim()) || (!child && /^[a-z][.)]/.test(lines[end][0].trim())))) end++;
      const start=lines[i].index; const finish=lines[end]?.index??combined.length;
      const text=combined.slice(start,finish).trim();
      if(text===title) continue;
      sections.push({title,text,sources:spans.filter(span=>span.end>start&&span.start<finish).map(span=>span.source),start});
    }
  }
  const selected=[]; const missing=[];
  for(const topic of topics) {
    const ranked=sections.map(section=>{
      const title=terms(section.title);const hits=topic.filter(term=>title.includes(term)).length;
      return {...section,score:hits/topic.length,extra:title.filter(term=>!topic.includes(term)).length};
    }).filter(section=>section.score>=.65).sort((a,b)=>b.score-a.score||a.extra-b.extra||a.text.length-b.text.length);
    if(ranked.length) selected.push(ranked[0]); else missing.push(topic.join(' '));
  }
  // Use existing passage ranking when there are no explicit matching topic headings.
  if(!selected.length) return null;
  const unique=[...new Map(selected.map(section=>[section.text,section])).values()];
  return {status:missing.length?'insufficient_context':'answered',model:'document-extractive',
    answer:unique.map(section=>formatPassage(section.text)).join('\n\n')+(missing.length?'\n\nChưa tìm được mục trả lời rõ cho một phần câu hỏi trong nguồn đã truy hồi.':''),
    sources:[...new Map(unique.flatMap(section=>section.sources).map(source=>[source.chunkId,source])).values()]};
}
