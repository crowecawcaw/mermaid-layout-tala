// Translated from internal/trees/traversal.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Tree } from '../layoutgraph/records.js';
export function Descendants(root: Tree | null): Tree[] {
  if (!root) return [];
  const descendants: Tree[] = [],
    queue = [root];
  for (let index = 0; index < queue.length; index++)
    for (const child of queue[index]!.Children) {
      descendants.push(child);
      queue.push(child);
    }
  return descendants;
}
