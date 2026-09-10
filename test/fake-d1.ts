type ScriptedResult = unknown;

class FakeStatement {
  params: unknown[] = [];

  constructor(
    readonly sql: string,
    private readonly take: () => ScriptedResult,
  ) {}

  bind(...params: unknown[]) {
    this.params = params;
    return this;
  }

  async first<T>() {
    return this.take() as T | null;
  }

  async all<T>() {
    const value = this.take();
    return { results: (value ?? []) as T[] };
  }

  async run() {
    return (this.take() ?? { success: true }) as D1Result;
  }
}

export function scriptedD1(responses: ScriptedResult[]) {
  const queue = [...responses];
  const statements: FakeStatement[] = [];
  const batches: FakeStatement[][] = [];

  const db = {
    prepare(sql: string) {
      const statement = new FakeStatement(sql, () => queue.shift());
      statements.push(statement);
      return statement;
    },
    async batch(items: FakeStatement[]) {
      batches.push(items);
      return items.map(() => ({ success: true }));
    },
  } as unknown as D1Database;

  return { db, statements, batches };
}
