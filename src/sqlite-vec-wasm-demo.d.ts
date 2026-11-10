/**
 * `sqlite-vec-wasm-demo` ships no type declarations — it is an emscripten
 * build of SQLite with the sqlite-vec extension compiled in. Only the surface
 * this library actually calls is declared here; the rest stays unknown on
 * purpose, so a typo in SQLite's own sprawling API is a compile error rather
 * than a runtime one.
 *
 * The package is named "demo" by its author but is the official sqlite-vec
 * WASM distribution, published from the sqlite-vec repository.
 */
declare module 'sqlite-vec-wasm-demo' {
  export type BindValue = string | number | null | Uint8Array | bigint;

  export interface Sqlite3Db {
    exec(sql: string): void;
    exec(opts: {
      sql: string;
      bind?: BindValue[];
      rowMode?: 'array' | 'object';
      resultRows?: unknown[];
      columnNames?: string[];
    }): void;
    selectValue(sql: string, bind?: BindValue[]): unknown;
    selectObjects(sql: string, bind?: BindValue[]): Array<Record<string, unknown>>;
    close(): void;
  }

  export interface Sqlite3 {
    version: { libVersion: string };
    oo1: { DB: new (filename?: string) => Sqlite3Db };
  }

  export interface InitOptions {
    setStatus?: (text: string) => void;
    onRuntimeInitialized?: (this: unknown) => void;
    locateFile?: (path: string) => string;
    print?: (text: string) => void;
    printErr?: (text: string) => void;
  }

  export default function sqlite3InitModule(options?: InitOptions): Promise<Sqlite3>;
}
