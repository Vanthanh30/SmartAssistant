// Match text anchors, then retain the surrounding pixels (not reconstructed maths).
const fold = text => text.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').toLowerCase();
const ignored = new Set('cong thuc tinh la gi cua cac trong cho toi hay va voi nao'.split(' '));
export function normalizeAnchor(text) {
  return fold(text).replace(/\s+/g, ' ').trim();
}

export function locateFormulaRegion(items, viewport, question, imageBoxes = []) {
  const terms = [...new Set(normalizeAnchor(question).match(/[a-z0-9]+/g) || [])].filter(term => !ignored.has(term));
  if (!terms.length) return null;
  const boxes = items.filter(item => typeof item.str === 'string' && item.str.trim() && item.transform)
    .map(item => {
      const [x, y] = item.transform.slice(4);
      const height = item.height || Math.hypot(item.transform[2], item.transform[3]) || 10;
      const [a, b, c, d, e, f] = viewport.transform;
      const point = (px, py) => [a * px + c * py + e, b * px + d * py + f];
      const rect = [...point(x, y), ...point(x + item.width, y + height)];
      return { text: item.str, left: Math.min(rect[0], rect[2]), right: Math.max(rect[0], rect[2]),
        top: Math.min(rect[1], rect[3]), bottom: Math.max(rect[1], rect[3]) };
    }).filter(box => [box.left, box.right, box.top, box.bottom].every(Number.isFinite));
  const rows = [];
  for (const box of boxes.sort((a, b) => a.top - b.top || a.left - b.left)) {
    const row = rows.find(row => Math.abs(row.top - box.top) < 5);
    if (row) { row.boxes.push(box); row.bottom = Math.max(row.bottom, box.bottom); }
    else rows.push({ top: box.top, bottom: box.bottom, boxes: [box] });
  }
  // PDF item strings are concatenated without inserting artificial glyph spaces.
  for (const row of rows) {
    row.boxes.sort((a, b) => a.left - b.left);
    let text = '';
    row.boxes.forEach((box, index) => {
      const previous = row.boxes[index - 1];
      text += (previous && box.left - previous.right > 2 ? ' ' : '') + box.text;
    });
    row.text = normalizeAnchor(text);
    row.score = terms.filter(term => new RegExp(`\\b${term}\\b`).test(row.text)).length / terms.length;
    if (row.text.includes(terms.join(' '))) row.score += .5;
  }
  const ranked = rows.filter(row => row.score >= .5).sort((a, b) => b.score - a.score);
  for (const anchor of ranked) {
    const nearby = rows.filter(row => row.top >= anchor.top - 25 && row.top <= anchor.bottom + 110);
    const illustration = /hình ảnh|hình minh họa|sơ đồ|biểu đồ|đồ thị/i.test(question);
    const adjacentImage = illustration ? imageBoxes.filter(box => box.bottom >= anchor.top - 220 && box.top <= anchor.bottom + 220)
      .sort((a,b) => Math.abs((a.top + a.bottom) / 2 - anchor.top) - Math.abs((b.top + b.bottom) / 2 - anchor.top))[0] : null;
    if (adjacentImage) {
      const left = Math.max(0, adjacentImage.left - 12);
      const top = Math.max(0, adjacentImage.top - 12);
      return { left, top, width: Math.min(viewport.width, adjacentImage.right + 12) - left,
        height: Math.min(viewport.height, adjacentImage.bottom + 12) - top, score: anchor.score };
    }
    if (!nearby.some(row => /[=≈∝]/.test(row.text))) continue;
    const nextSection = nearby.find(row => row.top > anchor.bottom + 15 && /^(?:\d+|[a-z])[.)]\s*/.test(row.text));
    const regionBoxes = nearby.filter(row => !nextSection || row.top < nextSection.top).flatMap(row => row.boxes);
    const left = Math.max(0, Math.min(...regionBoxes.map(box => box.left)) - 18);
    const right = Math.min(viewport.width, Math.max(...regionBoxes.map(box => box.right)) + 18);
    const top = Math.max(0, anchor.top - 8);
    const bottom = Math.min(viewport.height, nextSection ? nextSection.top - 6 : Infinity, Math.max(...regionBoxes.map(box => box.bottom)) + 12);
    if (right > left && bottom > top) return { left, top, width: right - left, height: bottom - top, score: anchor.score };
  }
  return null;
}

// Locate raster illustrations using the actual PDF drawing transforms; no OCR or guessed pixels.
export function pdfImageBoxes(operatorList, viewport, OPS, Util) {
  let matrix = [1, 0, 0, 1, 0, 0]; const stack = []; const boxes = [];
  for (let i = 0; i < operatorList.fnArray.length; i++) {
    const fn = operatorList.fnArray[i]; const args = operatorList.argsArray[i];
    if (fn === OPS.save) stack.push([...matrix]);
    else if (fn === OPS.restore) matrix = stack.pop() || [1, 0, 0, 1, 0, 0];
    else if (fn === OPS.transform) matrix = Util.transform(matrix, args);
    else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
      const transform = Util.transform(viewport.transform, matrix);
      const points = [[0,0],[1,0],[0,1],[1,1]].map(point => Util.applyTransform(point, transform));
      const left = Math.min(...points.map(p => p[0])); const right = Math.max(...points.map(p => p[0]));
      const top = Math.min(...points.map(p => p[1])); const bottom = Math.max(...points.map(p => p[1]));
      if ([left,right,top,bottom].every(Number.isFinite) && right-left > 40 && bottom-top > 40) boxes.push({left,right,top,bottom});
    }
  }
  return boxes;
}

// Exact block anchor, not the user's broad question. Ambiguous matches fail closed.
function locateExactBlockRegion(items, viewport, source) {
  const compact = text => text.normalize('NFC').replace(/\s/gu, '');
  const needle = compact(source.anchor || '');
  if (!needle) return null;
  const boxes = items.filter(item => item.str && item.transform).map(item => {
    const [x,y] = item.transform.slice(4); const h = item.height || Math.hypot(item.transform[2],item.transform[3]) || 10;
    const [a,b,c,d,e,f] = viewport.transform;
    const point = (px,py) => [a*px+c*py+e,b*px+d*py+f];
    const corners = [point(x,y),point(x+item.width,y),point(x,y+h),point(x+item.width,y+h)];
    return { text:item.str,left:Math.min(...corners.map(p=>p[0])),right:Math.max(...corners.map(p=>p[0])),
      top:Math.min(...corners.map(p=>p[1])),bottom:Math.max(...corners.map(p=>p[1])) };
  }).filter(box => [box.left,box.right,box.top,box.bottom].every(Number.isFinite));
  // Keep superscripts/subscripts attached to their baseline instead of sorting solely by y.
  const rows = [];
  for (const box of [...boxes].sort((a,b)=>a.top-b.top||a.left-b.left)) {
    let row = rows.find(row => box.top <= row.bottom && box.bottom >= row.top);
    if (!row) { row={top:box.top,bottom:box.bottom,boxes:[]}; rows.push(row); }
    row.boxes.push(box); row.top=Math.min(row.top,box.top); row.bottom=Math.max(row.bottom,box.bottom);
  }
  const geometrical = rows.sort((a,b)=>a.top-b.top).flatMap(row=>row.boxes.sort((a,b)=>a.left-b.left));
  // Try original PDF text order as well: extraction preserves that order even for fractions.
  const original = boxes;
  const ordered = compact(original.map(box=>box.text).join('')).includes(needle) ? original : geometrical;
  let text=''; const spans=[];
  for (const box of ordered) { const start=text.length; text+=compact(box.text); spans.push({box,start,end:text.length}); }
  const matches=[];
  for (let start=text.indexOf(needle);start>=0;start=text.indexOf(needle,start+1)) {
    const prefix=compact(source.prefix||'').slice(-40); const suffix=compact(source.suffix||'').slice(0,40);
    if (text.indexOf(needle,start+1)>=0 || matches.length) {
      if ((!prefix || !text.slice(0,start).endsWith(prefix)) && (!suffix || !text.slice(start+needle.length).startsWith(suffix))) continue;
    }
    matches.push({start,end:start+needle.length});
  }
  if (matches.length!==1) return null;
  const match=matches[0]; const selected=spans.filter(span=>span.end>match.start&&span.start<match.end).map(span=>span.box);
  if (!selected.length) return null;
  let left=Math.max(0,Math.min(...selected.map(box=>box.left))-10);
  let right=Math.min(viewport.width,Math.max(...selected.map(box=>box.right))+10);
  let top=Math.max(0,Math.min(...selected.map(box=>box.top))-12);
  let bottom=Math.min(viewport.height,Math.max(...selected.map(box=>box.bottom))+12);
  // Do not crop through adjacent text: return a source-page fallback instead.
  const core={left:Math.min(...selected.map(box=>box.left)),right:Math.max(...selected.map(box=>box.right)),top:Math.min(...selected.map(box=>box.top)),bottom:Math.max(...selected.map(box=>box.bottom))};
  for (const box of boxes.filter(box=>!selected.includes(box))) {
    if (box.left<core.right&&box.right>core.left&&box.top<core.bottom&&box.bottom>core.top) return null;
    if (box.left<right&&box.right>left) { if (box.bottom<=core.top) top=Math.max(top,box.bottom+1); if(box.top>=core.bottom) bottom=Math.min(bottom,box.top-1); }
    if (box.top<bottom&&box.bottom>top) { if(box.right<=core.left) left=Math.max(left,box.right+1); if(box.left>=core.right) right=Math.min(right,box.left-1); }
  }
  return right>left&&bottom>top ? {left,top,width:right-left,height:bottom-top,score:1} : null;
}

// When formula glyph order differs, locate the verified text immediately before AND after it.
// Both boundaries must uniquely agree; never replace this with a whole-page crop.
export function locateBlockRegion(items, viewport, source) {
  const exact=locateExactBlockRegion(items,viewport,source);
  if(exact && exact.height < viewport.height*.65) return exact;
  const compact=text=>text.normalize('NFC').replace(/\s/gu,'');
  const before=compact(source.prefix||'').slice(-70);
  const after=compact(source.suffix||'').slice(0,70);
  if(before.length<16 || after.length<16) return null;
  const stream=items.filter(item=>item.str && item.transform);
  let text=''; const spans=[];
  for(const item of stream) { const start=text.length; text+=compact(item.str); spans.push({item,start,end:text.length}); }
  const left=text.indexOf(before); if(left<0 || text.indexOf(before,left+1)>=0) return null;
  const right=text.indexOf(after,left+before.length);
  if(right<0 || text.indexOf(after,right+1)>=0 || right-left>2000) return null;
  // Preserve neighbouring theory anchors with all intervening source glyphs/formula items.
  const matched=spans.filter(span=>span.end>left+before.length&&span.start<right);
  const boxes=matched.map(({item})=> {
    const [x,y]=item.transform.slice(4);const h=item.height||Math.hypot(item.transform[2],item.transform[3])||10;
    const [a,b,c,d,e,f]=viewport.transform;const point=(px,py)=>[a*px+c*py+e,b*px+d*py+f];
    const points=[point(x,y),point(x+item.width,y),point(x,y+h),point(x+item.width,y+h)];
    return {left:Math.min(...points.map(p=>p[0])),right:Math.max(...points.map(p=>p[0])),top:Math.min(...points.map(p=>p[1])),bottom:Math.max(...points.map(p=>p[1]))};
  });
  if(!boxes.length) return null;
  const region={left:Math.max(0,Math.min(...boxes.map(b=>b.left))-10),top:Math.max(0,Math.min(...boxes.map(b=>b.top))-12)};
  region.width=Math.min(viewport.width,Math.max(...boxes.map(b=>b.right))+10)-region.left;
  region.height=Math.min(viewport.height,Math.max(...boxes.map(b=>b.bottom))+12)-region.top;
  if(region.width<=0 || region.height<=0 || region.height>viewport.height*.45) return null;
  return {...region,score:.9};
}
