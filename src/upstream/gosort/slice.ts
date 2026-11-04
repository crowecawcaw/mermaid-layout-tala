// Copyright 2022 The Go Authors. All rights reserved.
// Direct translation of sort/{slice,sort,zsortfunc}.go, Go 1.27.1.
// BSD-style license: ../../../LICENSE-GO.
export function Slice<T>(data: T[], less: (a: T, b: T) => boolean): void {
  const Less = (a: number, b: number) => less(data[a]!, data[b]!),
    Swap = (a: number, b: number) => {
      [data[a], data[b]] = [data[b]!, data[a]!];
    };
  const insertionSort = (a: number, b: number) => {
    for (let i = a + 1; i < b; i++)
      for (let j = i; j > a && Less(j, j - 1); j--) Swap(j, j - 1);
  };
  const siftDown = (lo: number, hi: number, first: number) => {
    let root = lo;
    for (;;) {
      let child = 2 * root + 1;
      if (child >= hi) break;
      if (child + 1 < hi && Less(first + child, first + child + 1)) child++;
      if (!Less(first + root, first + child)) return;
      Swap(first + root, first + child);
      root = child;
    }
  };
  const heapSort = (a: number, b: number) => {
    const hi = b - a;
    for (let i = Math.trunc((hi - 1) / 2); i >= 0; i--) siftDown(i, hi, a);
    for (let i = hi - 1; i >= 0; i--) {
      Swap(a, a + i);
      siftDown(0, i, a);
    }
  };
  const partition = (
    a: number,
    b: number,
    pivot: number,
  ): [number, boolean] => {
    Swap(a, pivot);
    let i = a + 1,
      j = b - 1;
    while (i <= j && Less(i, a)) i++;
    while (i <= j && !Less(j, a)) j--;
    if (i > j) {
      Swap(j, a);
      return [j, true];
    }
    Swap(i, j);
    i++;
    j--;
    for (;;) {
      while (i <= j && Less(i, a)) i++;
      while (i <= j && !Less(j, a)) j--;
      if (i > j) break;
      Swap(i, j);
      i++;
      j--;
    }
    Swap(j, a);
    return [j, false];
  };
  const partitionEqual = (a: number, b: number, pivot: number) => {
    Swap(a, pivot);
    let i = a + 1,
      j = b - 1;
    for (;;) {
      while (i <= j && !Less(a, i)) i++;
      while (i <= j && Less(a, j)) j--;
      if (i > j) break;
      Swap(i, j);
      i++;
      j--;
    }
    return i;
  };
  const partialInsertionSort = (a: number, b: number) => {
    let i = a + 1;
    for (let step = 0; step < 5; step++) {
      while (i < b && !Less(i, i - 1)) i++;
      if (i === b) return true;
      if (b - a < 50) return false;
      Swap(i, i - 1);
      if (i - a >= 2)
        for (let j = i - 1; j >= 1; j--) {
          if (!Less(j, j - 1)) break;
          Swap(j, j - 1);
        }
      if (b - i >= 2)
        for (let j = i + 1; j < b; j++) {
          if (!Less(j, j - 1)) break;
          Swap(j, j - 1);
        }
    }
    return false;
  };
  const breakPatterns = (a: number, b: number) => {
    const length = b - a;
    if (length >= 8) {
      let random = BigInt(length);
      const modulus = 1n << BigInt(length.toString(2).length);
      for (
        let idx = a + Math.trunc(length / 4) * 2 - 1;
        idx <= a + Math.trunc(length / 4) * 2 + 1;
        idx++
      ) {
        random = BigInt.asUintN(64, random ^ (random << 13n));
        random ^= random >> 7n;
        random = BigInt.asUintN(64, random ^ (random << 17n));
        let other = Number(random & (modulus - 1n));
        if (other >= length) other -= length;
        Swap(idx, a + other);
      }
    }
  };
  const choosePivot = (a: number, b: number): [number, number] => {
    const length = b - a;
    let swaps = 0,
      i = a + Math.trunc(length / 4),
      j = a + Math.trunc(length / 4) * 2,
      k = a + Math.trunc(length / 4) * 3;
    const order2 = (a: number, b: number): [number, number] => {
      if (Less(b, a)) {
        swaps++;
        return [b, a];
      }
      return [a, b];
    };
    const median = (a: number, b: number, c: number) => {
      [a, b] = order2(a, b);
      [b, c] = order2(b, c);
      [a, b] = order2(a, b);
      return b;
    };
    if (length >= 8) {
      if (length >= 50) {
        i = median(i - 1, i, i + 1);
        j = median(j - 1, j, j + 1);
        k = median(k - 1, k, k + 1);
      }
      j = median(i, j, k);
    }
    return [j, swaps === 0 ? 1 : swaps === 12 ? 2 : 0];
  };
  const pdqsort = (a: number, b: number, limit: number): void => {
    let wasBalanced = true,
      wasPartitioned = true;
    for (;;) {
      const length = b - a;
      if (length <= 12) {
        insertionSort(a, b);
        return;
      }
      if (limit === 0) {
        heapSort(a, b);
        return;
      }
      if (!wasBalanced) {
        breakPatterns(a, b);
        limit--;
      }
      let [pivot, hint] = choosePivot(a, b);
      if (hint === 2) {
        for (let i = a, j = b - 1; i < j; i++, j--) Swap(i, j);
        pivot = b - 1 - (pivot - a);
        hint = 1;
      }
      if (
        wasBalanced &&
        wasPartitioned &&
        hint === 1 &&
        partialInsertionSort(a, b)
      )
        return;
      if (a > 0 && !Less(a - 1, pivot)) {
        a = partitionEqual(a, b, pivot);
        continue;
      }
      const [mid, alreadyPartitioned] = partition(a, b, pivot);
      wasPartitioned = alreadyPartitioned;
      const leftLen = mid - a,
        rightLen = b - mid,
        balanceThreshold = Math.trunc(length / 8);
      if (leftLen < rightLen) {
        wasBalanced = leftLen >= balanceThreshold;
        pdqsort(a, mid, limit);
        a = mid + 1;
      } else {
        wasBalanced = rightLen >= balanceThreshold;
        pdqsort(mid + 1, b, limit);
        b = mid;
      }
    }
  };
  pdqsort(
    0,
    data.length,
    data.length === 0 ? 0 : data.length.toString(2).length,
  );
}
