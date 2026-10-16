// Only join adjacent answer blocks whose verified PDF regions share a physical row.
// This preserves adjoining symbol definitions without joining separate equations below.
export function formulaGroups(blocks, regions) {
  const result = {};
  for (let index = 0; index < blocks.length; index++) {
    const first = blocks[index];
    const base = regions[first.id];
    if (first.type !== 'formula_image' || !base || result[first.id]) continue;
    let union = { ...base };
    const members = [first.id];
    for (let next = index + 1; next < blocks.length; next++) {
      const block = blocks[next];
      const region = regions[block.id];
      if (block.type !== 'formula_image' || !region
        || region.documentId !== base.documentId || region.page !== base.page
        || block.source?.chunkId !== first.source?.chunkId) break;
      const overlap = Math.min(base.top + base.height, region.top + region.height) - Math.max(base.top, region.top);
      const gap = Math.max(region.left - (union.left + union.width), union.left - (region.left + region.width), 0);
      if (overlap < Math.min(base.height, region.height) * 0.55 || gap > 16
        || region.left < base.left + base.width * 0.5) break;
      const left = Math.min(union.left, region.left);
      const top = Math.min(union.top, region.top);
      union = { ...base, left, top,
        width: Math.max(union.left + union.width, region.left + region.width) - left,
        height: Math.max(union.top + union.height, region.top + region.height) - top };
      members.push(block.id);
    }
    if (members.length > 1) {
      const group = { leader: first.id, region: union, key: JSON.stringify([members, union]) };
      for (const id of members) result[id] = group;
    }
  }
  return result;
}
