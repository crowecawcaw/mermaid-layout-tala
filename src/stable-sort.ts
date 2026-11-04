// Copyright 2012 The Go Authors. All rights reserved. See LICENSE-GO.
// Adapted from Go slices stableCmpFunc/symMergeCmpFunc. Matching the comparison
// schedule matters for upstream comparators whose equivalence is nontransitive.
export function goStableSort<T>(data: T[], compare: (a: T, b: T) => number): T[] {
  const swap = (a: number, b: number) => {
    [data[a], data[b]] = [data[b]!, data[a]!];
  };
  const swapRange = (a: number, b: number, n: number) => {
    for (let i = 0; i < n; i++) swap(a + i, b + i);
  };
  const insertion = (a: number, b: number) => {
    for (let i = a + 1; i < b; i++)
      for (let j = i; j > a && compare(data[j]!, data[j - 1]!) < 0; j--) swap(j, j - 1);
  };
  const rotate = (a: number, m: number, b: number) => {
    let i = m - a,
      j = b - m;
    while (i !== j) {
      if (i > j) {
        swapRange(m - i, m, j);
        i -= j;
      } else {
        swapRange(m - i, m + j - i, i);
        j -= i;
      }
    }
    swapRange(m - i, m, i);
  };
  const merge = (a: number, m: number, b: number): void => {
    if (m - a === 1) {
      let i = m,
        j = b;
      while (i < j) {
        const h = Math.floor((i + j) / 2);
        if (compare(data[h]!, data[a]!) < 0) i = h + 1;
        else j = h;
      }
      for (let k = a; k < i - 1; k++) swap(k, k + 1);
      return;
    }
    if (b - m === 1) {
      let i = a,
        j = m;
      while (i < j) {
        const h = Math.floor((i + j) / 2);
        if (!(compare(data[m]!, data[h]!) < 0)) i = h + 1;
        else j = h;
      }
      for (let k = m; k > i; k--) swap(k, k - 1);
      return;
    }
    const mid = Math.floor((a + b) / 2),
      n = mid + m;
    let start = m > mid ? n - b : a,
      r = m > mid ? mid : m;
    const p = n - 1;
    while (start < r) {
      const c = Math.floor((start + r) / 2);
      if (!(compare(data[p - c]!, data[c]!) < 0)) start = c + 1;
      else r = c;
    }
    const end = n - start;
    if (start < m && m < end) rotate(start, m, end);
    if (a < start && start < mid) merge(a, start, mid);
    if (mid < end && end < b) merge(mid, end, b);
  };
  const n = data.length;
  let block = 20,
    a = 0,
    b = block;
  for (; b <= n; a = b, b += block) insertion(a, b);
  insertion(a, n);
  while (block < n) {
    a = 0;
    b = 2 * block;
    for (; b <= n; a = b, b += 2 * block) merge(a, a + block, b);
    if (a + block < n) merge(a, a + block, n);
    block *= 2;
  }
  return data;
}
