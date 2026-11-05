// Translated from internal/routing/priority_queue.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
export interface QueueWorkBudget {
  Add(units: bigint): void;
}
export class PriorityQueueEntry<T> {
  node: T | null = null;
  isHorizontal = false;
  priority = 0;
  index = -1;
  order = 0n;
}
export class PriorityQueue<T> {
  private items: PriorityQueueEntry<T>[] = [];
  private entries: PriorityQueueEntry<T>[] = [];
  private cursor = 0;
  private nextOrder = 0n;
  reset(): void {
    this.items.length = 0;
    this.cursor = 0;
    this.nextOrder = 0n;
  }
  empty(): boolean {
    return this.items.length === 0;
  }
  push(
    priority: number,
    node: T,
    isHorizontal: boolean,
    guard: QueueWorkBudget | null,
  ): PriorityQueueEntry<T> {
    this.reserve(guard, this.items.length + 1, 1);
    let entry = this.entries[this.cursor];
    if (!entry) {
      entry = new PriorityQueueEntry<T>();
      this.entries.push(entry);
    }
    this.cursor++;
    entry.priority = priority;
    entry.node = node;
    entry.isHorizontal = isHorizontal;
    entry.index = this.items.length;
    entry.order = this.nextOrder;
    this.nextOrder = BigInt.asUintN(64, this.nextOrder + 1n);
    this.items.push(entry);
    this.siftUp(entry.index);
    return entry;
  }
  pop(guard: QueueWorkBudget | null): PriorityQueueEntry<T> {
    if (this.empty())
      throw new Error('cannot dequeue minimum of empty priority queue');
    this.reserve(guard, this.items.length, 2);
    const min = this.items[0]!,
      lastIndex = this.items.length - 1,
      last = this.items[lastIndex]!;
    this.items.pop();
    min.index = -1;
    if (lastIndex !== 0) {
      this.items[0] = last;
      last.index = 0;
      this.siftDown(0);
    }
    return min;
  }
  decrease(
    entry: PriorityQueueEntry<T> | null,
    priority: number,
    guard: QueueWorkBudget | null,
  ): void {
    if (this.empty())
      throw new Error('cannot decrease priority in an empty priority queue');
    if (!entry) throw new Error('cannot decrease priority: entry is nil');
    if (
      entry.index < 0 ||
      entry.index >= this.items.length ||
      this.items[entry.index] !== entry
    )
      throw new Error(
        'cannot decrease priority: entry is not in the priority queue',
      );
    if (priority >= entry.priority)
      throw new Error(
        `new priority ${priority} is not less than old priority ${entry.priority}`,
      );
    this.reserve(guard, entry.index + 1, 1);
    entry.priority = priority;
    this.siftUp(entry.index);
  }
  private reserve(
    guard: QueueWorkBudget | null,
    upper: number,
    units: number,
  ): void {
    if (guard)
      guard.Add(
        BigInt((upper === 0 ? 0 : Math.floor(Math.log2(upper)) + 1) * units),
      );
  }
  private less(i: number, j: number): boolean {
    const a = this.items[i]!,
      b = this.items[j]!;
    return a.priority !== b.priority
      ? a.priority < b.priority
      : a.order < b.order;
  }
  private swap(i: number, j: number): void {
    [this.items[i], this.items[j]] = [this.items[j]!, this.items[i]!];
    this.items[i]!.index = i;
    this.items[j]!.index = j;
  }
  private siftUp(index: number): void {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (!this.less(index, parent)) return;
      this.swap(index, parent);
      index = parent;
    }
  }
  private siftDown(index: number): void {
    for (;;) {
      const left = index * 2 + 1;
      if (left >= this.items.length) return;
      let smallest = left;
      const right = left + 1;
      if (right < this.items.length && this.less(right, left)) smallest = right;
      if (!this.less(smallest, index)) return;
      this.swap(index, smallest);
      index = smallest;
    }
  }
}
