import { createHash, randomUUID } from "node:crypto";
import type {
  DocumentData,
  DocumentReference,
  Firestore,
  Query,
  WriteBatch,
} from "firebase-admin/firestore";
import { getFirebaseAdminDb } from "./admin.server";
import { runFirestoreRpc } from "./rpc.server";
import type { Database } from "./types";

export type DataError = Error & { code?: string };
export type DataResult<T = any> = { data: T; error: DataError | null; count?: number | null };

type Filter =
  | {
      kind: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "is" | "ilike";
      field: string;
      value: unknown;
    }
  | { kind: "in"; field: string; value: unknown[] }
  | { kind: "not"; field: string; operator: string; value: unknown }
  | { kind: "or"; expression: string };
type Sort = { field: string; ascending: boolean };
type Write =
  | { kind: "insert"; rows: Record<string, unknown>[] }
  | {
      kind: "upsert";
      rows: Record<string, unknown>[];
      onConflict?: string;
      ignoreDuplicates?: boolean;
    }
  | { kind: "update"; values: Record<string, unknown> }
  | { kind: "delete" };

type AnyRow = Record<string, any>;
type Relations = Database["public"]["Tables"] & Database["public"]["Views"];
type RelationName = keyof Relations;
type RelationRow<Name extends RelationName> = Relations[Name] extends { Row: infer Row }
  ? Row
  : AnyRow;
type BuilderRow<T> = T extends Array<infer Row> ? Row : T;

type SelectOptions = { count?: "exact" | "planned" | "estimated"; head?: boolean };
type SingleMode = "many" | "single" | "maybe";

const DEFAULTS: Record<string, Record<string, unknown>> = {
  users: {
    profession: null,
    avatar_url: null,
    is_pro: false,
    pro_since: null,
    pro_until: null,
    reputation: 0,
    streak: 0,
    total_accuracy: 0,
    bio: null,
    last_active_date: null,
    referral_code: null,
    referred_by: null,
  },
  battle_sessions: {
    score: null,
    correct_count: null,
    answers: {},
    submitted_at: null,
    time_taken_seconds: null,
  },
  quiz_sessions: {
    answers: {},
    submitted_at: null,
    correct_count: null,
    incorrect_count: null,
    accuracy: null,
    score: null,
    time_taken_seconds: null,
    was_auto_submitted: false,
    xp_eligible: false,
  },
  review_items: { box: 1, reviewed_count: 0, last_result: null },
  mega_test_entries: {
    access_verified_at: null,
    session_id: null,
    score: null,
    correct_count: null,
    rank: null,
    pro_prize_awarded_at: null,
  },
  mega_access_tasks: {
    is_active: true,
    provider: null,
    provider_task_id: null,
    provider_placement_id: null,
    min_questions: 1,
    min_score_percent: 0,
  },
  notifications: { read_at: null, body: null, link: null },
  forum_posts: { upvote_count: 0, reply_count: 0, view_count: 0 },
  forum_replies: { upvote_count: 0 },
  doubts: { resolved: false, upvote_count: 0, reply_count: 0, image_url: null },
  doubt_replies: { is_accepted: false, upvote_count: 0, image_url: null },
  study_groups: { is_private: false, member_count: 1 },
  ai_chat_threads: { title: "New chat" },
};

function cleanObject(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function createdRow(table: string, input: Record<string, unknown>, forcedId?: string) {
  const now = new Date().toISOString();
  const id = String(forcedId ?? input.id ?? randomUUID());
  return cleanObject({
    ...(DEFAULTS[table] ?? {}),
    created_at: input.created_at ?? now,
    updated_at: input.updated_at ?? now,
    ...input,
    id,
  });
}

/**
 * Keep deterministic Firestore IDs compatible with application validators that
 * expect record IDs to be UUIDs. The bits are shaped like UUIDv5, while the
 * digest uses SHA-256 for a stable namespace/value mapping.
 */
export function deterministicDocumentId(table: string, values: unknown[]) {
  const bytes = Buffer.from(
    createHash("sha256")
      .update(`${table}\u0000${values.map((value) => JSON.stringify(value)).join("\u0000")}`)
      .digest("hex")
      .slice(0, 32),
    "hex",
  );
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const UNIQUE_FIELDS: Record<string, string[]> = {
  subjects: ["code", "profession"],
  chapters: ["subject_id", "name"],
  user_roles: ["user_id", "role"],
  forum_categories: ["slug"],
  forum_votes: ["user_id", "target_type", "target_id"],
  study_group_members: ["group_id", "user_id"],
  follows: ["follower_id", "following_id"],
  badges: ["slug"],
  user_badges: ["user_id", "badge_id"],
  user_daily_challenges: ["user_id", "challenge_date"],
  review_items: ["user_id", "question_id"],
  daily_challenges: ["challenge_date"],
  quiz_question_xp_awards: ["user_id", "question_id"],
  battle_question_xp_awards: ["user_id", "question_id"],
  revise_topics: ["user_id", "chapter_id"],
  social_links: ["platform"],
  promo_code_redemptions: ["promo_code_id", "user_id"],
  pro_payment_events: ["provider", "provider_payment_id"],
  mega_tests: ["profession", "scheduled_start"],
  mega_test_entries: ["mega_test_id", "user_id"],
  mega_access_task_assignments: ["mega_test_id", "task_id"],
  mega_access_task_attempts: ["mega_test_id", "task_id", "user_id"],
};

function collectionName(table: string) {
  // public_profiles used to be a SQL view over users. In Firestore users is the
  // canonical document and there is deliberately no duplicate view collection.
  return table === "public_profiles" ? "users" : table;
}

function normalizeDataError(error: unknown): DataError {
  if (!(error instanceof Error)) return new Error(String(error));
  const code = String((error as { code?: unknown }).code ?? "");
  if (code === "6" || code === "already-exists") {
    const duplicate = new Error(`duplicate: ${error.message}`) as DataError;
    duplicate.code = "already-exists";
    return duplicate;
  }
  return error as DataError;
}

function pathValue(row: Record<string, unknown>, field: string): unknown {
  return field.split(".").reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[part];
  }, row);
}

function comparable(value: unknown): string | number | boolean | null | undefined {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === "object" && "toDate" in value) {
    return (value as { toDate(): Date }).toDate().getTime();
  }
  return value as string | number | boolean | null | undefined;
}

function compare(left: unknown, right: unknown) {
  const a = comparable(left);
  const b = comparable(right);
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  return a < b ? -1 : 1;
}

function like(value: unknown, pattern: unknown) {
  if (typeof value !== "string" || typeof pattern !== "string") return false;
  const escaped = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/%/g, ".*")
    .replace(/_/g, ".");
  return new RegExp(`^${escaped}$`, "i").test(value);
}

function matchesSimple(row: Record<string, unknown>, kind: string, field: string, value: unknown) {
  const actual = pathValue(row, field);
  switch (kind) {
    case "eq":
    case "is":
      return actual === value || (actual == null && value == null);
    case "neq":
      return actual !== value;
    case "gt":
      return compare(actual, value) > 0;
    case "gte":
      return compare(actual, value) >= 0;
    case "lt":
      return compare(actual, value) < 0;
    case "lte":
      return compare(actual, value) <= 0;
    case "ilike":
      return like(actual, value);
    default:
      return false;
  }
}

function parseScalar(raw: string): unknown {
  if (raw === "null") return null;
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
  return raw;
}

function matchesOr(row: Record<string, unknown>, expression: string) {
  return expression.split(",").some((clause) => {
    const [field, operator, ...rest] = clause.split(".");
    if (!field || !operator || rest.length === 0) return false;
    return matchesSimple(row, operator, field, parseScalar(rest.join(".")));
  });
}

function matchesFilter(row: Record<string, unknown>, filter: Filter): boolean {
  if (filter.kind === "in")
    return filter.value.some((value) => pathValue(row, filter.field) === value);
  if (filter.kind === "or") return matchesOr(row, filter.expression);
  if (filter.kind === "not") {
    if (filter.operator === "is") return !matchesSimple(row, "is", filter.field, filter.value);
    return !matchesSimple(row, filter.operator, filter.field, filter.value);
  }
  return matchesSimple(row, filter.kind, filter.field, filter.value);
}

function selectColumns(row: Record<string, unknown>, columns: string | undefined) {
  if (!columns || columns.trim() === "*") return row;
  if (columns.includes("(") || columns.includes(")")) {
    throw new Error("Relational projections are not supported by the Firestore adapter");
  }
  const output: Record<string, unknown> = {};
  for (const column of columns.split(",")) {
    const name = column.trim();
    if (name) output[name] = pathValue(row, name);
  }
  return output;
}

async function commitBatches(db: Firestore, actions: Array<(batch: WriteBatch) => void>) {
  for (let offset = 0; offset < actions.length; offset += 450) {
    const batch = db.batch();
    for (const action of actions.slice(offset, offset + 450)) action(batch);
    await batch.commit();
  }
}

export class FirestoreQueryBuilder<T = AnyRow[], Row = BuilderRow<T>> implements PromiseLike<
  DataResult<T>
> {
  private filters: Filter[] = [];
  private sorts: Sort[] = [];
  private maxRows: number | undefined;
  private rangeStart: number | undefined;
  private rangeEnd: number | undefined;
  private columns: string | undefined;
  private selectOptions: SelectOptions = {};
  private mode: SingleMode = "many";
  private write: Write | undefined;

  constructor(
    private readonly dbPromise: Promise<Firestore>,
    private readonly table: string,
  ) {}

  select(columns = "*", options: SelectOptions = {}): FirestoreQueryBuilder<Row[], Row> {
    this.columns = columns;
    this.selectOptions = options;
    return this as unknown as FirestoreQueryBuilder<Row[], Row>;
  }

  insert(
    values: Record<string, unknown> | Record<string, unknown>[],
    options: SelectOptions = {},
  ): FirestoreQueryBuilder<null, Row> {
    this.write = { kind: "insert", rows: Array.isArray(values) ? values : [values] };
    this.selectOptions = options;
    return this as unknown as FirestoreQueryBuilder<null, Row>;
  }

  upsert(
    values: Record<string, unknown> | Record<string, unknown>[],
    options: { onConflict?: string; ignoreDuplicates?: boolean } = {},
  ): FirestoreQueryBuilder<null, Row> {
    this.write = {
      kind: "upsert",
      rows: Array.isArray(values) ? values : [values],
      onConflict: options.onConflict,
      ignoreDuplicates: options.ignoreDuplicates,
    };
    return this as unknown as FirestoreQueryBuilder<null, Row>;
  }

  update(values: Record<string, unknown>): FirestoreQueryBuilder<null, Row> {
    this.write = { kind: "update", values };
    return this as unknown as FirestoreQueryBuilder<null, Row>;
  }

  delete(): FirestoreQueryBuilder<null, Row> {
    this.write = { kind: "delete" };
    return this as unknown as FirestoreQueryBuilder<null, Row>;
  }

  eq(field: string, value: unknown) {
    this.filters.push({ kind: "eq", field, value });
    return this;
  }
  neq(field: string, value: unknown) {
    this.filters.push({ kind: "neq", field, value });
    return this;
  }
  gt(field: string, value: unknown) {
    this.filters.push({ kind: "gt", field, value });
    return this;
  }
  gte(field: string, value: unknown) {
    this.filters.push({ kind: "gte", field, value });
    return this;
  }
  lt(field: string, value: unknown) {
    this.filters.push({ kind: "lt", field, value });
    return this;
  }
  lte(field: string, value: unknown) {
    this.filters.push({ kind: "lte", field, value });
    return this;
  }
  is(field: string, value: unknown) {
    this.filters.push({ kind: "is", field, value });
    return this;
  }
  in(field: string, values: unknown[]) {
    this.filters.push({ kind: "in", field, value: values });
    return this;
  }
  ilike(field: string, value: string) {
    this.filters.push({ kind: "ilike", field, value });
    return this;
  }
  not(field: string, operator: string, value: unknown) {
    this.filters.push({ kind: "not", field, operator, value });
    return this;
  }
  or(expression: string) {
    this.filters.push({ kind: "or", expression });
    return this;
  }
  order(field: string, options: { ascending?: boolean } = {}) {
    this.sorts.push({ field, ascending: options.ascending !== false });
    return this;
  }
  limit(value: number) {
    this.maxRows = Math.max(0, value);
    return this;
  }
  range(from: number, to: number) {
    this.rangeStart = Math.max(0, from);
    this.rangeEnd = Math.max(this.rangeStart, to);
    return this;
  }
  single(): FirestoreQueryBuilder<Row, Row> {
    this.mode = "single";
    return this as unknown as FirestoreQueryBuilder<Row, Row>;
  }
  maybeSingle(): FirestoreQueryBuilder<Row | null, Row> {
    this.mode = "maybe";
    return this as unknown as FirestoreQueryBuilder<Row | null, Row>;
  }

  then<TResult1 = DataResult<T>, TResult2 = never>(
    onfulfilled?: ((value: DataResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async readRows(db: Firestore): Promise<Array<Record<string, unknown>>> {
    const collection = db.collection(collectionName(this.table));
    const idEq = this.filters.find((filter) => filter.kind === "eq" && filter.field === "id");
    if (idEq && "value" in idEq && typeof idEq.value === "string") {
      const snapshot = await collection.doc(idEq.value).get();
      return snapshot.exists ? [{ ...snapshot.data(), id: snapshot.id }] : [];
    }
    const idIn = this.filters.find((filter) => filter.kind === "in" && filter.field === "id");
    if (idIn?.kind === "in") {
      if (idIn.value.length === 0) return [];
      const refs = idIn.value
        .filter((id): id is string => typeof id === "string")
        .map((id) => collection.doc(id));
      const snapshots = refs.length ? await db.getAll(...refs) : [];
      return snapshots.filter((doc) => doc.exists).map((doc) => ({ ...doc.data(), id: doc.id }));
    }

    // Apply one selective server-side predicate to avoid collection-wide reads.
    // Remaining SQL-shaped behavior (OR, ILIKE, null semantics and multi-column
    // ordering) is deterministic in memory and therefore needs no composite index.
    let query: Query<DocumentData> = collection;
    const primary = this.filters.find(
      (filter) =>
        (filter.kind === "eq" || filter.kind === "is") &&
        "value" in filter &&
        filter.value !== undefined,
    );
    if (primary && primary.kind !== "or" && primary.kind !== "not" && primary.kind !== "in") {
      query = query.where(primary.field, "==", primary.value);
    } else {
      const range = this.filters.find((filter) => ["gt", "gte", "lt", "lte"].includes(filter.kind));
      if (range && range.kind !== "or" && range.kind !== "not" && range.kind !== "in") {
        const operators: Record<"gt" | "gte" | "lt" | "lte", ">" | ">=" | "<" | "<="> = {
          gt: ">",
          gte: ">=",
          lt: "<",
          lte: "<=",
        };
        const operator = operators[range.kind as "gt" | "gte" | "lt" | "lte"];
        query = query.where(range.field, operator, range.value);
      }
    }
    const snapshot = await query.get();
    return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
  }

  private shape(rows: Array<Record<string, unknown>>): DataResult<any> {
    let filtered = rows.filter((row) => this.filters.every((filter) => matchesFilter(row, filter)));
    if (this.sorts.length) {
      filtered = filtered.sort((left, right) => {
        for (const sort of this.sorts) {
          const result = compare(pathValue(left, sort.field), pathValue(right, sort.field));
          if (result) return sort.ascending ? result : -result;
        }
        return 0;
      });
    }
    const count = filtered.length;
    if (this.rangeStart !== undefined) {
      filtered = filtered.slice(this.rangeStart, (this.rangeEnd ?? this.rangeStart) + 1);
    }
    if (this.maxRows !== undefined) filtered = filtered.slice(0, this.maxRows);
    const projected = filtered.map((row) => selectColumns(row, this.columns));

    if (this.selectOptions.head) return { data: null, error: null, count };
    if (this.mode === "single") {
      if (projected.length !== 1) {
        return {
          data: null,
          error: new Error(`Expected one ${this.table} row, found ${projected.length}`),
        };
      }
      return {
        data: projected[0],
        error: null,
        count: this.selectOptions.count ? count : undefined,
      };
    }
    if (this.mode === "maybe") {
      if (projected.length > 1) {
        return {
          data: null,
          error: new Error(`Expected at most one ${this.table} row, found ${projected.length}`),
        };
      }
      return {
        data: projected[0] ?? null,
        error: null,
        count: this.selectOptions.count ? count : undefined,
      };
    }
    return { data: projected, error: null, count: this.selectOptions.count ? count : undefined };
  }

  private async executeWrite(db: Firestore): Promise<Array<Record<string, unknown>>> {
    if (!this.write) return this.readRows(db);
    if (this.table === "public_profiles") {
      throw new Error("public_profiles is read-only; write the canonical users collection");
    }
    const collection = db.collection(collectionName(this.table));

    if (this.write.kind === "insert") {
      const uniqueFields = UNIQUE_FIELDS[this.table];
      const rows = this.write.rows.map((input) => {
        const forcedId =
          typeof input.id === "string"
            ? input.id
            : uniqueFields
              ? deterministicDocumentId(
                  this.table,
                  uniqueFields.map((field) => pathValue(input, field)),
                )
              : undefined;
        return createdRow(this.table, input, forcedId);
      });
      await commitBatches(
        db,
        rows.map((row) => (batch) => batch.create(collection.doc(String(row.id)), row)),
      );
      return rows;
    }

    if (this.write.kind === "upsert") {
      const conflictFields = (this.write.onConflict ?? "id")
        .split(",")
        .map((field) => field.trim())
        .filter(Boolean);
      const output: Record<string, unknown>[] = [];
      for (const input of this.write.rows) {
        const explicitId = typeof input.id === "string" ? input.id : undefined;
        const docId =
          explicitId ??
          deterministicDocumentId(
            this.table,
            conflictFields.map((field) => pathValue(input, field)),
          );
        const ref = collection.doc(docId);
        const row = createdRow(this.table, input, docId);
        const result = await db.runTransaction(async (transaction) => {
          const existing = await transaction.get(ref);
          if (existing.exists && this.write?.kind === "upsert" && this.write.ignoreDuplicates) {
            return { ...existing.data(), id: existing.id } as Record<string, unknown>;
          }
          const next = existing.exists
            ? cleanObject({
                ...existing.data(),
                ...input,
                id: existing.id,
                updated_at: new Date().toISOString(),
              })
            : row;
          transaction.set(ref, next, { merge: false });
          return next;
        });
        output.push(result);
      }
      return output;
    }

    const matches = await this.readRows(db);
    const affected = matches.filter((row) =>
      this.filters.every((filter) => matchesFilter(row, filter)),
    );
    if (this.write.kind === "delete") {
      await commitBatches(
        db,
        affected.map((row) => (batch) => batch.delete(collection.doc(String(row.id)))),
      );
      return affected;
    }

    const values = this.write.values;
    const updated = affected.map((row) =>
      cleanObject({ ...row, ...values, id: row.id, updated_at: new Date().toISOString() }),
    );
    await commitBatches(
      db,
      updated.map(
        (row) => (batch) => batch.set(collection.doc(String(row.id)), row, { merge: false }),
      ),
    );
    return updated;
  }

  private async execute(): Promise<DataResult<T>> {
    try {
      const db = await this.dbPromise;
      const rows = await this.executeWrite(db);
      if (this.write && !this.columns && this.mode === "many" && !this.selectOptions.count) {
        return { data: null as T, error: null };
      }
      return this.shape(rows) as DataResult<T>;
    } catch (error) {
      return { data: null as T, error: normalizeDataError(error) };
    }
  }
}

export class FirestoreDataClient {
  constructor(private readonly dbPromise: Promise<Firestore> = getFirebaseAdminDb()) {}

  from<Name extends RelationName>(table: Name): FirestoreQueryBuilder<Array<RelationRow<Name>>>;
  from(table: string): FirestoreQueryBuilder<AnyRow[]>;
  from(table: string): FirestoreQueryBuilder<AnyRow[]> {
    return new FirestoreQueryBuilder<AnyRow[]>(this.dbPromise, table);
  }

  async rpc(name: string, args: Record<string, unknown> = {}): Promise<DataResult<any>> {
    try {
      const data = await runFirestoreRpc(await this.dbPromise, name, args);
      return { data, error: null };
    } catch (error) {
      return { data: null, error: normalizeDataError(error) };
    }
  }
}

let client: FirestoreDataClient | undefined;

export function getFirestoreDataClient() {
  client ??= new FirestoreDataClient();
  return client;
}

export const firestoreAdmin = getFirestoreDataClient();
