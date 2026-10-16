import { generateTree } from './generate.js';

self.onmessage = (e) => {
  const { id, doc } = e.data;
  try {
    const result = generateTree(doc);
    const transfer = [result.skeleton.buffer];
    if (result.collision) transfer.push(result.collision.position.buffer, result.collision.index.buffer);
    for (const g of result.groups) {
      for (const a of Object.values(g.attributes)) if (!transfer.includes(a.buffer)) transfer.push(a.buffer);
      transfer.push(g.index.buffer);
    }
    self.postMessage({ id, result }, transfer);
  } catch (err) {
    self.postMessage({ id, error: String(err?.stack || err) });
  }
};
