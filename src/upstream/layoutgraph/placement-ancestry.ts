// Translated internal/layoutgraph/node.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Node } from './node.js';

export function containerLevel(node: Node): number {
  let level = 0;
  for (
    let current: Node | null = node;
    current !== null;
    current = current.container()
  )
    level++;
  return level;
}
export function nearestSharedAncestor(node: Node, other: Node): Node | null {
  let container = node.container(),
    otherContainer = other.container();
  if (container === null || otherContainer === null) return null;
  let nodeLevel = containerLevel(node),
    otherLevel = containerLevel(other);
  while (container !== otherContainer) {
    if (nodeLevel === otherLevel) {
      container = container.container();
      nodeLevel--;
      otherContainer = otherContainer.container();
      otherLevel--;
    } else if (nodeLevel > otherLevel) {
      container = container.container();
      nodeLevel--;
    } else {
      otherContainer = otherContainer.container();
      otherLevel--;
    }
    if (container === null || otherContainer === null) return null;
  }
  return container;
}
