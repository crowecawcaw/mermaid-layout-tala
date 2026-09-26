/** routing/priority_queue.go's indexed min-heap for OVG path search.
 * Entries remain mutable handles until popped or reset. */
export interface TalaQueueEntry<T> {
  node: T;
  isHorizontal: boolean;
  priority: number;
  index: number;
  order: number;
}

export class TalaPriorityQueue<T> {
  private items: TalaQueueEntry<T>[] = [];
  private nextOrder = 0;

  reset(): void {
    for (const item of this.items) item.index = -1;
    this.items.length = 0;
    this.nextOrder = 0;
  }

  empty(): boolean { return this.items.length === 0; }

  push(priority: number, node: T, isHorizontal: boolean): TalaQueueEntry<T> {
    const entry = { priority, node, isHorizontal,
      index: this.items.length, order: this.nextOrder++ };
    this.items.push(entry);
    this.siftUp(entry.index);
    return entry;
  }

  pop(): TalaQueueEntry<T> {
    if (this.empty()) throw new Error('cannot dequeue minimum of empty priority queue');
    const min = this.items[0]!;
    const lastIndex = this.items.length - 1;
    const last = this.items.pop()!;
    min.index = -1;
    if (lastIndex !== 0) {
      this.items[0] = last;
      last.index = 0;
      this.siftDown(0);
    }
    return min;
  }

  decrease(entry: TalaQueueEntry<T>, priority: number): void {
    if (this.empty()) throw new Error('cannot decrease priority in an empty priority queue');
    if (entry.index < 0 || entry.index >= this.items.length
      || this.items[entry.index] !== entry) {
      throw new Error('cannot decrease priority: entry is not in the priority queue');
    }
    if (priority >= entry.priority) {
      throw new Error(`new priority ${priority} is not less than old priority ${entry.priority}`);
    }
    entry.priority = priority;
    this.siftUp(entry.index);
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

  private less(left: number, right: number): boolean {
    const a = this.items[left]!, b = this.items[right]!;
    return a.priority !== b.priority ? a.priority < b.priority : a.order < b.order;
  }

  private swap(left: number, right: number): void {
    [this.items[left], this.items[right]] = [this.items[right]!, this.items[left]!];
    this.items[left]!.index = left;
    this.items[right]!.index = right;
  }
}
