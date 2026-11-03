// Geometry shared by PDF extraction and source cropping; no browser/Node APIs.
export function pdfTextLines(items) {
  const rows = [];
  for (const item of items.filter(item => item.str?.trim() && item.transform)) {
    const [a, b, , , x, y] = item.transform;
    const height = item.height || Math.hypot(a, b) || 10;
    const angle = Math.atan2(b, a);
    let row = rows.find(row => Math.abs(row.y - y) <= Math.max(row.height, height) * .36
      && Math.abs(row.angle - angle) < .05);
    if (!row) { row = {y, height, angle, items: []}; rows.push(row); }
    row.height = Math.max(row.height, height);
    row.items.push({item, x, right:x + item.width, height});
  }
  return rows.sort((a,b) => b.y - a.y).map(row => {
    row.items.sort((a,b) => a.x - b.x);
    let text = '';
    row.items.forEach((box,index) => {
      const previous = row.items[index-1];
      const space = previous && box.x - previous.right > Math.min(box.height,previous.height) * .14
        && !/\s$/.test(text) && !/^\s/.test(box.item.str);
      text += (space ? ' ' : '') + box.item.str;
    });
    return {text:text.normalize('NFC'), items:row.items.map(box => box.item)};
  });
}
export function geometryRows(items) {
  return pdfTextLines(items).map((row,index) => {
    const heights=row.items.map(i=>i.height||Math.hypot(i.transform[0],i.transform[1])||10);
    const height=Math.max(...heights), y=Math.max(...row.items.map(i=>i.transform[5]));
    const cells=[];
    for (const item of row.items) {
      const x=item.transform[4], right=x+Math.abs(item.width||0), previous=cells.at(-1);
      if(previous && x-previous.right<=height*2) {
        previous.items.push(item);previous.right=Math.max(previous.right,right);previous.text=pdfTextLines(previous.items).map(r=>r.text).join(' ');
      } else cells.push({left:x,right,text:item.str.normalize('NFC'),items:[item]});
    }
    return {...row,index,height,y,left:Math.min(...cells.map(c=>c.left)),right:Math.max(...cells.map(c=>c.right)),cells};
  });
}

// A gutter needs repeated independent rows. A single wide gap is not a column.
export function columnReadingOrder(rows, width, spanning = new Set()) {
  const usable=rows.filter(r=>!spanning.has(r.index));
  const gaps=usable.flatMap(r=>r.cells.slice(1).map((c,i)=>({left:r.cells[i].right,right:c.left,row:r.index})));
  const candidates=gaps.filter(g=>g.right-g.left>=20&&(g.left+g.right)/2>width*.25&&(g.left+g.right)/2<width*.75);
  let best=null;
  for(const candidate of candidates) {
    const cut=(candidate.left+candidate.right)/2;
    const support=new Set(gaps.filter(g=>g.left<cut&&g.right>cut&&g.right-g.left>=20).map(g=>g.row)).size;
    if(support>=3&&support>=usable.length*.4&&(!best||support>best.support))best={cut,support};
  }
  if(!best)return {rows,columns:1};
  const output=[],band=[];
  const flush=()=>{for(const side of ['left','right'])for(const row of band){
    const items=row.items.filter(item=>side==='left'?item.transform[4]+Math.abs(item.width||0)<=best.cut:item.transform[4]>=best.cut);
    if(items.length)output.push({...row,items,text:pdfTextLines(items).map(r=>r.text).join(' '),
      left:Math.min(...items.map(i=>i.transform[4])),right:Math.max(...items.map(i=>i.transform[4]+Math.abs(i.width||0))),column:side==='left'?0:1});
  }band.length=0;};
  for(const row of rows) {
    const crosses=row.items.some(i=>i.transform[4]<best.cut&&i.transform[4]+Math.abs(i.width||0)>best.cut);
    if(spanning.has(row.index)||crosses){flush();output.push(row);}else band.push(row);
  }
  flush();return {rows:output,columns:2,gutter:best.cut};
}
