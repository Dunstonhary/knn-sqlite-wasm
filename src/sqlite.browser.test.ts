import { describe, expect, it } from 'vitest';
import { bitBytes, openVecStore, type SqliteVecStore } from './index.js';

const DIMS = 16;

/** Deterministic unit vectors, so every assertion here is reproducible. */
function vec(seed: number, dims = DIMS): Float32Array {
  const v = new Float32Array(dims);
  for (let i = 0; i < dims; i++) v[i] = Math.sin(seed * 7.13 + i * 1.37);
  let n = 0;
  for (let i = 0; i < dims; i++) n += (v[i] as number) ** 2;
  n = Math.sqrt(n);
  for (let i = 0; i < dims; i++) v[i] = (v[i] as number) / n;
  return v;
}

async function seeded(count = 24): Promise<SqliteVecStore> {
  const store = await openVecStore({
    dims: DIMS,
    columns: { label: 'text', bucket: 'integer' },
    name: 'docs',
  });
  store.addMany(
    Array.from({ length: count }, (_, i) => ({
      id: i,
      vector: vec(i),
      row: { label: `doc ${i}`, bucket: i % 3 },
    })),
  );
  return store;
}

describe('bitBytes', () => {
  it('packs eight dimensions to the byte, rounding up', () => {
    expect(bitBytes(384)).toBe(48);
    expect(bitBytes(8)).toBe(1);
    expect(bitBytes(9)).toBe(2);
  });
});

describe('openVecStore', () => {
  it('reports the SQLite and sqlite-vec it is actually running', async () => {
    const store = await seeded();
    try {
      const stats = store.stats();
      expect(stats.sqliteVersion).toMatch(/^3\./);
      expect(stats.vecVersion).toMatch(/^v\d/);
      expect(stats.rows).toBe(24);
      expect(stats.dims).toBe(DIMS);
      expect(stats.bytes).toBe(stats.pageCount * stats.pageSize);
    } finally {
      store.close();
    }
  });

  it('creates the payload table and the vec0 index it was asked for', async () => {
    const store = await seeded();
    try {
      const names = store.tables().map((t) => t.name);
      expect(names).toContain('docs');
      expect(names).toContain('docs_bits');
      const bits = store.tables().find((t) => t.name === 'docs_bits');
      expect(bits?.kind).toBe('virtual');
      expect(bits?.sql).toContain('using vec0');
      expect(bits?.sql).toContain(`bit[${DIMS}]`);
    } finally {
      store.close();
    }
  });

  it('keeps the caller columns as real columns, not a JSON blob', async () => {
    const store = await seeded();
    try {
      // The whole reason to put a corpus in SQLite: it can be filtered in SQL.
      const res = store.exec('select count(*) from docs where bucket = ?', [1]);
      expect(res.rows[0]?.[0]).toBe(8);
      expect(store.exec('select label from docs where id = 5').rows[0]?.[0]).toBe('doc 5');
    } finally {
      store.close();
    }
  });

  it('finds a vector it was given, ahead of every other', async () => {
    const store = await seeded();
    try {
      const hits = store.search(vec(7), 3, 24);
      expect(hits).toHaveLength(3);
      expect(hits[0]?.id).toBe(7);
      expect(hits[0]?.cosine).toBeCloseTo(1, 5);
      expect(hits[0]?.row.label).toBe('doc 7');
      expect(hits[0]?.hamming).toBe(0);
    } finally {
      store.close();
    }
  });

  it('ranks by cosine descending and carries the stage-1 bit distance', async () => {
    const store = await seeded();
    try {
      const hits = store.search(vec(3.5), 6, 24);
      for (let i = 1; i < hits.length; i++) {
        expect(hits[i]?.cosine).toBeLessThanOrEqual(hits[i - 1]?.cosine as number);
      }
      for (const h of hits) {
        expect(h.hamming).toBeGreaterThanOrEqual(0);
        expect(h.hamming).toBeLessThanOrEqual(DIMS);
      }
    } finally {
      store.close();
    }
  });

  it('agrees with an exhaustive scan when stage 1 is wide enough', async () => {
    const store = await seeded();
    try {
      for (const seed of [0.5, 11.2, 19.9]) {
        const staged = store.search(vec(seed), 5, 24);
        const exact = store.searchExact(vec(seed), 5);
        expect(
          staged.map((h) => h.id),
          String(seed),
        ).toEqual(exact.map((h) => h.id));
      }
    } finally {
      store.close();
    }
  });

  it('refuses a vector of the wrong width instead of storing a bad row', async () => {
    const store = await openVecStore({ dims: DIMS });
    try {
      expect(() => store.add(1, new Float32Array(8))).toThrow(/8 dims, store holds 16/);
      // The failed insert must not have left half a row behind.
      expect(store.stats().rows).toBe(0);
    } finally {
      store.close();
    }
  });

  it('rolls the whole batch back when one row in it is bad', async () => {
    const store = await openVecStore({ dims: DIMS });
    try {
      expect(() =>
        store.addMany([
          { id: 1, vector: vec(1) },
          { id: 2, vector: new Float32Array(3) },
        ]),
      ).toThrow();
      expect(store.stats().rows).toBe(0);
    } finally {
      store.close();
    }
  });

  it('rejects a table or column name that is not a plain identifier', async () => {
    await expect(openVecStore({ dims: DIMS, name: 'docs; drop table x' })).rejects.toThrow(
      /plain identifier/,
    );
    await expect(openVecStore({ dims: DIMS, columns: { 'a b': 'text' } })).rejects.toThrow(
      /plain identifier/,
    );
  });

  it('rejects a dims that cannot describe a vector', async () => {
    await expect(openVecStore({ dims: 0 })).rejects.toThrow(/positive integer/);
    await expect(openVecStore({ dims: 1.5 })).rejects.toThrow(/positive integer/);
  });

  it('refuses to be used after close', async () => {
    const store = await openVecStore({ dims: DIMS });
    store.close();
    expect(() => store.stats()).toThrow(/closed/);
    expect(() => store.exec('select 1')).toThrow(/closed/);
    // Closing twice is a no-op rather than an error.
    expect(() => store.close()).not.toThrow();
  });

  it('runs arbitrary SQL, which is what makes the store inspectable', async () => {
    const store = await seeded();
    try {
      const res = store.exec(
        'select id, label from docs where bucket = ? order by id limit 2',
        [2],
      );
      expect(res.columns).toEqual(['id', 'label']);
      expect(res.rows).toEqual([
        [2, 'doc 2'],
        [5, 'doc 5'],
      ]);
      expect(res.ms).toBeGreaterThanOrEqual(0);
    } finally {
      store.close();
    }
  });
});

describe('metadata filtering', () => {
  it('narrows the search in SQL rather than in the caller', async () => {
    const store = await seeded();
    try {
      const hits = store.search(vec(7), 5, 24, { where: 't.bucket = ?', bind: [0] });
      expect(hits.length).toBeGreaterThan(0);
      for (const h of hits) expect(h.row.bucket).toBe(0);
      // Rank 7 is bucket 1, so the filter must have moved the winner.
      expect(hits[0]?.id).not.toBe(7);
    } finally {
      store.close();
    }
  });

  it('binds filter values instead of interpolating them', async () => {
    const store = await seeded();
    try {
      // A value that would end the statement if it were interpolated.
      const hits = store.search(vec(1), 5, 24, {
        where: 't.label = ?',
        bind: ["doc 1'; drop table docs; --"],
      });
      expect(hits).toEqual([]);
      expect(store.stats().rows).toBe(24);
    } finally {
      store.close();
    }
  });
});
