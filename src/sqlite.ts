import sqlite3InitModule from 'sqlite-vec-wasm-demo';

/**
 * SQLite with sqlite-vec, in the browser.
 *
 * The same two-stage search as `BinaryKnnIndex`, executed by a database
 * instead of a JS loop:
 *
 *   - `<name>_bits` is a `vec0` virtual table of one-bit-per-dimension codes.
 *     Stage 1 — the cheap scan over everything, by Hamming distance.
 *   - `<name>.embedding` holds the full float32 vector. Stage 2 — the exact
 *     cosine rescore, over the shortlist only.
 *
 * What the database buys over the in-memory index is not speed at small
 * sizes; it is that the vectors sit next to their rows, so filtering,
 * joining and inspecting are SQL rather than more JavaScript.
 *
 * Browser only. This build of sqlite3 refuses to initialise anywhere else,
 * which is why its tests live in `*.browser.test.ts`.
 */

export type ColumnType = 'text' | 'integer' | 'real';

export interface VecStoreOptions {
  /** Dimensions of every vector. Fixed for the life of the store. */
  dims: number;
  /**
   * Columns to carry alongside each vector. These become real SQL columns,
   * not a JSON blob, so they can be filtered and joined on — and so anything
   * inspecting the database sees the data's actual shape.
   */
  columns?: Record<string, ColumnType>;
  /** Table name, and the prefix for the vector index. Default `vectors`. */
  name?: string;
}

export interface VecHit {
  id: number;
  /** Exact cosine similarity in full precision, 1 = identical. */
  cosine: number;
  /** Differing bits against the query code — what stage 1 compared. */
  hamming: number;
  /** The row's own columns, as stored. */
  row: Record<string, unknown>;
}

/**
 * A metadata filter applied during stage 2.
 *
 * `where` is a trusted SQL fragment over the payload table, aliased `t`;
 * values belong in `bind`, not interpolated. It runs *after* stage 1 has
 * chosen its shortlist, so on a large corpus a selective filter can return
 * fewer than `k` rows even though more exist — widen `overfetch` when that
 * matters. This is the standard cost of filtering an approximate index, not
 * a quirk of this one.
 */
export interface VecFilter {
  where: string;
  bind?: Array<string | number | null>;
}

/** A query's output, shaped for display rather than for a type. */
export interface SqlResult {
  columns: string[];
  rows: unknown[][];
  ms: number;
}

export interface TableInfo {
  name: string;
  /** `virtual` covers the vec0 tables and the shadow tables they create. */
  kind: 'table' | 'virtual' | 'index' | 'view';
  /** Null where the object cannot be counted, such as an index. */
  rows: number | null;
  sql: string;
}

export interface StoreStats {
  dims: number;
  rows: number;
  /** Size of the whole database, as SQLite reports it. */
  bytes: number;
  pageCount: number;
  pageSize: number;
  sqliteVersion: string;
  vecVersion: string;
}

/** 1 bit per dimension, packed 8 to a byte. */
export function bitBytes(dims: number): number {
  return Math.ceil(dims / 8);
}

/**
 * Table and column names are interpolated into SQL, so they are checked
 * rather than escaped: a name that is not a plain identifier is a
 * configuration mistake, and rejecting it is clearer than quoting around it.
 */
function identifier(name: string, what: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`sqlite: ${what} must be a plain identifier, got ${JSON.stringify(name)}`);
  }
  return name;
}

const asBlob = (v: Float32Array): Uint8Array =>
  new Uint8Array(v.buffer, v.byteOffset, v.byteLength);

let modulePromise: ReturnType<typeof sqlite3InitModule> | null = null;

/**
 * Load the wasm once per page.
 *
 * Two of these options are load-bearing, and neither is documented upstream.
 * Both were found by watching this build abort.
 *
 * `setStatus` — the build `await`s the wasm inside its factory and appends
 * sqlite3's own API as `--post-js` *after* that await, so `run()` reaches
 * `postRun()` before the API has registered itself, and emscripten aborts
 * with "Attempt to set `Module.postRun` after it has already been processed".
 * Supplying `setStatus` makes `run()` defer `doRun()` to a later task, which
 * lets the post-js get in first. The abort is a sequencing problem, not a
 * broken build — no custom Emscripten build is needed.
 *
 * `onRuntimeInitialized` — the wasm *is* compiled with `-sWASM_BIGINT`, but
 * `HEAPU64` is missing from this build's `EXPORTED_RUNTIME_METHODS`, and
 * reading an unexported symbol aborts rather than returning undefined.
 * sqlite3's bootstrap reads `Module.HEAPU64` exactly once, to decide
 * `bigIntEnabled`, so it has to find something there before postRun runs.
 *
 * Bundlers need a third piece: this build's own pre-js hardcodes
 * `Module.locateFile` to `new URL('sqlite3.wasm', import.meta.url)` and
 * overwrites any `locateFile` passed in here, so the only lever a host app
 * has is making sure `sqlite3.wasm` actually lands, unhashed, next to the
 * bundled chunk that imports this module (a dev server gets this for free by
 * excluding the package from dependency pre-bundling, `optimizeDeps.exclude`
 * under Vite; a production build needs its own `assetFileNames` override).
 */
export function loadSqlite(): ReturnType<typeof sqlite3InitModule> {
  modulePromise ??= sqlite3InitModule({
    setStatus: () => {},
    onRuntimeInitialized() {
      // An empty view, not a real one over the heap: the only read of
      // `Module.HEAPU64` in this build is `return !!Module.HEAPU64`, and an
      // empty typed array is truthy — the correct answer, since the wasm
      // genuinely is built with bigint support. Reaching for the real heap
      // would mean touching HEAPU8 or wasmMemory, unexported too.
      Object.defineProperty(this as object, 'HEAPU64', {
        configurable: true,
        value: new BigUint64Array(0),
      });
    },
  });
  return modulePromise;
}

/** A corpus and its vectors, held in SQLite. Create one with `openVecStore`. */
export class SqliteVecStore {
  readonly dims: number;
  readonly table: string;
  readonly bitsTable: string;
  readonly sqliteVersion: string;
  readonly vecVersion: string;

  private readonly db: import('sqlite-vec-wasm-demo').Sqlite3Db;
  private readonly columnNames: string[];
  private closed = false;

  /** @internal Use `openVecStore`; the schema has to exist before construction. */
  constructor(
    db: import('sqlite-vec-wasm-demo').Sqlite3Db,
    opts: {
      dims: number;
      table: string;
      columns: string[];
      sqliteVersion: string;
      vecVersion: string;
    },
  ) {
    this.db = db;
    this.dims = opts.dims;
    this.table = opts.table;
    this.bitsTable = `${opts.table}_bits`;
    this.columnNames = opts.columns;
    this.sqliteVersion = opts.sqliteVersion;
    this.vecVersion = opts.vecVersion;
  }

  /** Insert one vector and its row. */
  add(id: number, vector: Float32Array, row: Record<string, string | number | null> = {}): void {
    this.addMany([{ id, vector, row }]);
  }

  /**
   * Insert many, in one transaction.
   *
   * One statement per row either way — sqlite3's oo1 layer has no bulk bind —
   * but the single transaction is what keeps it from fsyncing per insert.
   */
  addMany(
    entries: Array<{
      id: number;
      vector: Float32Array;
      row?: Record<string, string | number | null>;
    }>,
  ): void {
    this.assertOpen();
    const cols = this.columnNames;
    const placeholders = ['?', ...cols.map(() => '?'), '?'].join(', ');
    const columnList = ['id', ...cols, 'embedding'].join(', ');

    this.db.exec('begin');
    try {
      for (const { id, vector, row } of entries) {
        if (vector.length !== this.dims) {
          throw new Error(
            `sqlite: vector for id ${id} has ${vector.length} dims, store holds ${this.dims}`,
          );
        }
        const blob = asBlob(vector);
        this.db.exec({
          sql: `insert into ${this.table}(${columnList}) values (${placeholders})`,
          bind: [id, ...cols.map((c) => row?.[c] ?? null), blob],
        });
        // Quantized by sqlite-vec rather than by the caller: the database
        // owns the stage-1 representation, which is the point of using it.
        this.db.exec({
          sql: `insert into ${this.bitsTable}(id, bits) values (?, vec_quantize_binary(vec_f32(?)))`,
          bind: [id, blob],
        });
      }
      this.db.exec('commit');
    } catch (err) {
      this.db.exec('rollback');
      throw err;
    }
  }

  /**
   * Two-stage search: Hamming shortlist, then exact cosine over it.
   *
   * `overfetch` is how wide stage 1 casts. Too narrow and the true nearest
   * neighbour can fall out before stage 2 ever sees it; `defaultOverfetch`
   * in this package is the measured starting point.
   */
  search(query: Float32Array, k: number, overfetch: number, filter?: VecFilter): VecHit[] {
    this.assertOpen();
    const blob = asBlob(query);
    return this.hits(
      `with shortlist as (
         select id, distance as hamming
           from ${this.bitsTable}
          where bits match vec_quantize_binary(vec_f32(?))
            and k = ?
       )
       select t.*, s.hamming as _hamming,
              vec_distance_cosine(t.embedding, vec_f32(?)) as _dist
         from shortlist s
         join ${this.table} t on t.id = s.id
        ${filter ? `where ${filter.where}` : ''}
        order by _dist
        limit ?`,
      [blob, overfetch, blob, ...(filter?.bind ?? []), k],
    );
  }

  /** Exhaustive cosine over every row — the ground truth to measure against. */
  searchExact(query: Float32Array, k: number): VecHit[] {
    this.assertOpen();
    const blob = asBlob(query);
    return this.hits(
      `select t.*, null as _hamming,
              vec_distance_cosine(t.embedding, vec_f32(?)) as _dist
         from ${this.table} t
        order by _dist
        limit ?`,
      [blob, k],
    );
  }

  private hits(sql: string, bind: Array<string | number | Uint8Array | null>): VecHit[] {
    return this.db.selectObjects(sql, bind).map((r) => {
      const row: Record<string, unknown> = {};
      for (const c of this.columnNames) row[c] = r[c];
      return {
        id: Number(r.id),
        // vec_distance_cosine returns a distance; similarity is 1 minus it.
        cosine: 1 - Number(r._dist),
        hamming: r._hamming === null ? Number.NaN : Number(r._hamming),
        row,
      };
    });
  }

  /**
   * Run arbitrary SQL and get back something displayable.
   *
   * Exists so the database can be looked at, not only queried through this
   * class. A vector store whose contents you cannot inspect is a black box
   * with extra steps.
   */
  exec(sql: string, bind: Array<string | number | Uint8Array | null> = []): SqlResult {
    this.assertOpen();
    const rows: unknown[][] = [];
    const columns: string[] = [];
    const t0 = performance.now();
    this.db.exec({ sql, bind, rowMode: 'array', resultRows: rows, columnNames: columns });
    return { columns, rows, ms: performance.now() - t0 };
  }

  /** Every object in the schema, with row counts where counting is possible. */
  tables(): TableInfo[] {
    this.assertOpen();
    const rows = this.db.selectObjects(
      `select name, type, sql from sqlite_master
        where name not like 'sqlite_%'
        order by case type when 'table' then 0 when 'view' then 1 else 2 end, name`,
    );
    return rows.map((r) => {
      const name = String(r.name);
      const sql = String(r.sql ?? '');
      const type = String(r.type);
      const kind: TableInfo['kind'] =
        type === 'index'
          ? 'index'
          : type === 'view'
            ? 'view'
            : /create\s+virtual\s+table/i.test(sql)
              ? 'virtual'
              : 'table';
      let count: number | null = null;
      if (kind !== 'index') {
        try {
          count = Number(this.db.selectValue(`select count(*) from "${name}"`));
        } catch {
          // Some vec0 shadow tables cannot be counted directly. Showing them
          // without a count beats hiding them.
          count = null;
        }
      }
      return { name, kind, rows: count, sql };
    });
  }

  stats(): StoreStats {
    this.assertOpen();
    const pageCount = Number(this.db.selectValue('select * from pragma_page_count()'));
    const pageSize = Number(this.db.selectValue('select * from pragma_page_size()'));
    return {
      dims: this.dims,
      rows: Number(this.db.selectValue(`select count(*) from ${this.table}`)),
      bytes: pageCount * pageSize,
      pageCount,
      pageSize,
      sqliteVersion: this.sqliteVersion,
      vecVersion: this.vecVersion,
    };
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('sqlite: store is closed');
  }
}

/** Open an in-memory store and create its schema. */
export async function openVecStore(options: VecStoreOptions): Promise<SqliteVecStore> {
  const { dims, columns = {}, name = 'vectors' } = options;
  if (!Number.isInteger(dims) || dims <= 0) {
    throw new Error(`sqlite: dims must be a positive integer, got ${dims}`);
  }
  const table = identifier(name, 'table name');
  const columnNames = Object.keys(columns).map((c) => identifier(c, 'column name'));

  const sqlite3 = await loadSqlite();
  const db = new sqlite3.oo1.DB(':memory:');

  try {
    const vecVersion = String(db.selectValue('select vec_version()'));
    const declared = columnNames.map((c) => `${c} ${columns[c]}`).join(', ');
    db.exec(
      `create table ${table}(
         id integer primary key${declared ? `, ${declared}` : ''},
         embedding blob not null
       );`,
    );
    db.exec(
      `create virtual table ${table}_bits using vec0(
         id integer primary key,
         bits bit[${dims}]
       );`,
    );
    return new SqliteVecStore(db, {
      dims,
      table,
      columns: columnNames,
      sqliteVersion: sqlite3.version.libVersion,
      vecVersion,
    });
  } catch (err) {
    db.close();
    throw err;
  }
}
