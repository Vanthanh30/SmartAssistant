// Partition contiguous selected pages by extracted text volume, preserving order.
// Each session receives at least one page; topic starts are preferred near a cut.
export function splitStudyPages(chunks,from,to,count){
 if(!Number.isInteger(count)||count<1||count>to-from+1)throw Error('SESSION_PAGE_COUNT_INVALID');
 const pages=Array.from({length:to-from+1},(_,n)=>({page:from+n,weight:1,heading:false}));
 for(const chunk of chunks){const position=typeof chunk.vi_tri_tren_trang==='string'?JSON.parse(chunk.vi_tri_tren_trang):chunk.vi_tri_tren_trang;for(const entry of position?.pageMap||[]){const p=pages.find(p=>p.page===entry.page);if(!p)continue;const start=Math.max(0,entry.start-(position.sourceStart||0)),end=Math.max(start,entry.end-(position.sourceStart||0));const content=chunk.noi_dung.slice(start,end);p.weight+=content.replace(/\s/g,'').length;p.heading||=/^(?:BÀI|CHƯƠNG|CHỦ ĐỀ|\d+[.)])\s/mu.test(content);}}
 const result=[];let cursor=0,remaining=pages.reduce((n,p)=>n+p.weight,0);
 for(let i=0;i<count;i++){const left=count-i;if(left===1){result.push({pageFrom:pages[cursor].page,pageTo:to});break;}const target=remaining/left;let sum=0,best=cursor,score=Infinity;for(let end=cursor;end<=pages.length-left;end++){sum+=pages[end].weight;const candidate=Math.abs(sum-target)*(pages[end+1]?.heading ? 0.8 : 1);if(candidate<score){score=candidate;best=end;}}const used=pages.slice(cursor,best+1).reduce((n,p)=>n+p.weight,0);result.push({pageFrom:pages[cursor].page,pageTo:pages[best].page});remaining-=used;cursor=best+1;}
 return result;
}
