export type DocType = "10-Q" | "10-K";

export type TagStatus = "suggested" | "accepted";

export interface XbrlTag {
    /** Fully qualified concept, e.g. `us-gaap:CashAndCashEquivalentsAtCarryingValue`. */
    concept: string;
    /** Model confidence between 0 and 1. */
    confidence: number;
    status: TagStatus;
}

export type RowKind = "header" | "line" | "subtotal" | "total";

export interface StatementRow {
    id: string;
    label: string;
    indent: number;
    kind: RowKind;
    /** One value per column. Subtotal/total rows are computed and may keep these as fallbacks. */
    values: (number | null)[];
    tag: XbrlTag | null;
    /** Where the number came from: a file, a linked bank, or manual entry. */
    source: string | null;
    sourceKind?: "file" | "gcs" | "bank" | "manual";
}

export interface Statement {
    id: string;
    name: string;
    /** Column headers, e.g. ["Jun 30, 2026", "Dec 31, 2025"]. */
    columns: string[];
    /** "instant" (balance sheet) or "duration" (income statement) — drives XBRL contexts. */
    periodType: "instant" | "duration";
    rows: StatementRow[];
}

export interface FilingTask {
    id: string;
    label: string;
    doc: DocType;
    done: boolean;
}

export type FileOrigin = "upload" | "gcs" | "bank";

export interface StoredFile {
    id: string;
    name: string;
    folder: string;
    size: string;
    origin: FileOrigin;
    addedAt: string;
    status: "ready" | "ingesting" | "mapped";
    mappedTo?: string;
    syncEnabled?: boolean;
}

export interface BankAccount {
    id: string;
    institution: string;
    name: string;
    mask: string;
    balance: number;
    lastSync: string;
}

export interface FilingRecord {
    id: string;
    doc: DocType;
    period: string;
    accession: string;
    filedAt: string;
    status: "accepted" | "transmitted";
}

export interface ActivityEvent {
    id: string;
    actor: string;
    avatar?: string;
    text: string;
    time: string;
}

export interface Collaborator {
    id: string;
    name: string;
    role: string;
    color: string;
    avatar: string;
}

export interface AppState {
    activeDoc: DocType;
    statements: Record<DocType, Statement[]>;
    tasks: FilingTask[];
    files: StoredFile[];
    banks: BankAccount[];
    gcsBucket: string | null;
    banksConnected: boolean;
    filings: FilingRecord[];
    activity: ActivityEvent[];
}

export interface ToastMessage {
    id: number;
    title: string;
    description?: string;
    color: "success" | "brand" | "warning" | "error";
}
