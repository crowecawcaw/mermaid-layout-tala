import { describe, expect, it } from 'vitest';
import { placeChildrenOrder } from '../src/tala/children-order.js';

describe('upstream PlaceChildrenOrder', () => {
  const nodes = ['hub', 'leafB', 'isolated', 'leafA'].map((id) => ({ id }));
  const abductions = [
    { currentFrom: { id: 'hub' }, currentTo: { id: 'leafA' } },
    { currentFrom: { id: 'leafB' }, currentTo: { id: 'hub' } },
  ];

  it('visits isolated children first and then breadth first from least degree', () => {
    expect(placeChildrenOrder(nodes, abductions).map((node) => node.id))
      .toEqual(['isolated', 'leafB', 'hub', 'leafA']);
    expect(nodes.map((node) => node.id)).toEqual(['hub', 'leafB', 'isolated', 'leafA']);
  });

  it('ignores abductions whose other endpoint is outside the container', () => {
    expect(placeChildrenOrder(nodes, [
      ...abductions, { currentFrom: { id: 'hub' }, currentTo: { id: 'external' } },
    ]).map((node) => node.id)).toEqual(['isolated', 'leafB', 'hub', 'leafA']);
  });
});
