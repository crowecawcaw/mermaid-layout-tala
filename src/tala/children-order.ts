/** Port of placement.PlaceChildrenOrder for container edge abductions. The
 * child list remains in graph order; this is only the recursive visit order. */
export function placeChildrenOrder<T extends { id: string }>(nodes: readonly T[],
  abductions: readonly { currentFrom?: { id: string }; currentTo?: { id: string } }[]): T[] {
  const expected = new Map<string, T>();
  const connected = new Map<string, Set<string>>();
  for (const node of nodes) {
    if (expected.has(node.id)) throw new Error(`duplicate child ${node.id}`);
    expected.set(node.id, node);
    connected.set(node.id, new Set());
  }
  for (const { currentFrom, currentTo } of abductions) {
    const from = currentFrom?.id, to = currentTo?.id;
    if (from && to && expected.has(from) && expected.has(to)) {
      connected.get(from)!.add(to);
      connected.get(to)!.add(from);
    }
  }
  const ordered: T[] = [];
  const orderedSet = new Set<string>();
  const appendNode = (node: T): void => {
    ordered.push(node);
    orderedSet.add(node.id);
    connected.delete(node.id);
  };
  for (const node of nodes) if (connected.get(node.id)!.size === 0) appendNode(node);
  while (ordered.length < nodes.length) {
    let leastDegree = nodes.length + 1;
    let start: T | undefined;
    for (const node of nodes) {
      const adjacent = connected.get(node.id);
      if (adjacent && adjacent.size < leastDegree) {
        leastDegree = adjacent.size;
        start = node;
      }
    }
    if (!start) throw new Error('could not order all container children');
    const visited = new Set<string>();
    const queue = [start];
    for (let head = 0; head < queue.length; head++) {
      const current = queue[head]!;
      if (visited.has(current.id)) continue;
      visited.add(current.id);
      if (orderedSet.has(current.id)) continue;
      appendNode(current);
      for (const { currentFrom, currentTo } of abductions) {
        const adjacent = currentFrom?.id === current.id ? currentTo?.id
          : currentTo?.id === current.id ? currentFrom?.id : undefined;
        if (adjacent && expected.has(adjacent)) queue.push(expected.get(adjacent)!);
      }
    }
  }
  return ordered;
}
