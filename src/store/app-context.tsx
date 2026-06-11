import type { PropsWithChildren } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState } from "react";
import type { ActivityEvent, AppState, BankAccount, DocType, FilingRecord, StatementRow, StoredFile, ToastMessage, XbrlTag } from "@/lib/types";
import type { Identity } from "@/lib/identity";
import { loadIdentity, saveIdentity, signInIdentity, signOutIdentity } from "@/lib/identity";
import { INITIAL_STATE } from "@/lib/initial-data";

const STORAGE_KEY = "inline-app-state-v3";

export type Action =
    | { type: "SET_DOC"; doc: DocType }
    | { type: "SET_CELL"; doc: DocType; stmtId: string; rowId: string; col: number; value: number | null }
    | { type: "SET_ROWS"; doc: DocType; stmtId: string; rows: StatementRow[] }
    | { type: "SET_TAG"; doc: DocType; stmtId: string; rowId: string; tag: XbrlTag }
    | { type: "ACCEPT_TAG"; doc: DocType; stmtId: string; rowId: string }
    | { type: "ACCEPT_ALL_TAGS"; doc: DocType }
    | { type: "TOGGLE_TASK"; id: string }
    | { type: "COMPLETE_TASK"; id: string }
    | { type: "ADD_FILE"; file: StoredFile }
    | { type: "UPDATE_FILE"; id: string; patch: Partial<StoredFile> }
    | { type: "CONNECT_GCS"; bucket: string }
    | { type: "CONNECT_BANKS"; accounts: BankAccount[] }
    | { type: "ADD_FILING"; record: FilingRecord }
    | { type: "LOG"; actor: string; text: string; avatar?: string }
    | { type: "RESET" };

const updateStatement = (state: AppState, doc: DocType, stmtId: string, fn: (rows: StatementRow[]) => StatementRow[]): AppState => ({
    ...state,
    statements: {
        ...state.statements,
        [doc]: state.statements[doc].map((s) => (s.id === stmtId ? { ...s, rows: fn(s.rows) } : s)),
    },
});

const reducer = (state: AppState, action: Action): AppState => {
    switch (action.type) {
        case "SET_DOC":
            return { ...state, activeDoc: action.doc };

        case "SET_CELL":
            return updateStatement(state, action.doc, action.stmtId, (rows) =>
                rows.map((row) => {
                    if (row.id !== action.rowId) return row;
                    const values = [...row.values];
                    values[action.col] = action.value;
                    return { ...row, values, source: "Manual entry", sourceKind: "manual" as const };
                }),
            );

        case "SET_ROWS":
            return updateStatement(state, action.doc, action.stmtId, () => action.rows);

        case "SET_TAG":
            return updateStatement(state, action.doc, action.stmtId, (rows) =>
                rows.map((row) => (row.id === action.rowId ? { ...row, tag: action.tag } : row)),
            );

        case "ACCEPT_TAG":
            return updateStatement(state, action.doc, action.stmtId, (rows) =>
                rows.map((row) => (row.id === action.rowId && row.tag ? { ...row, tag: { ...row.tag, status: "accepted" as const } } : row)),
            );

        case "ACCEPT_ALL_TAGS":
            return {
                ...state,
                statements: {
                    ...state.statements,
                    [action.doc]: state.statements[action.doc].map((s) => ({
                        ...s,
                        rows: s.rows.map((row) => (row.tag?.status === "suggested" ? { ...row, tag: { ...row.tag, status: "accepted" as const } } : row)),
                    })),
                },
            };

        case "TOGGLE_TASK":
            return { ...state, tasks: state.tasks.map((t) => (t.id === action.id ? { ...t, done: !t.done } : t)) };

        case "COMPLETE_TASK":
            return { ...state, tasks: state.tasks.map((t) => (t.id === action.id ? { ...t, done: true } : t)) };

        case "ADD_FILE":
            return { ...state, files: [action.file, ...state.files] };

        case "UPDATE_FILE":
            return { ...state, files: state.files.map((f) => (f.id === action.id ? { ...f, ...action.patch } : f)) };

        case "CONNECT_GCS":
            return { ...state, gcsBucket: action.bucket };

        case "CONNECT_BANKS":
            return { ...state, banksConnected: true, banks: action.accounts };

        case "ADD_FILING":
            return { ...state, filings: [action.record, ...state.filings] };

        case "LOG": {
            const event: ActivityEvent = {
                id: `a-${Date.now()}-${Math.round(Math.random() * 1e4)}`,
                actor: action.actor,
                avatar: action.avatar,
                text: action.text,
                time: "Just now",
            };
            return { ...state, activity: [event, ...state.activity].slice(0, 30) };
        }

        case "RESET":
            return INITIAL_STATE;

        default:
            return state;
    }
};

interface AppContextValue {
    state: AppState;
    dispatch: React.Dispatch<Action>;
    toast: (t: Omit<ToastMessage, "id">) => void;
    toasts: ToastMessage[];
    dismissToast: (id: number) => void;
    /** Who this browser session is: anonymous visitor or signed-in account. */
    identity: Identity;
    signIn: () => void;
    signOut: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

const loadInitialState = (): AppState => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw) as AppState;
    } catch {
        // Corrupt or unavailable storage — fall back to seed data.
    }
    return INITIAL_STATE;
};

let toastCounter = 0;

export const AppProvider = ({ children }: PropsWithChildren) => {
    const [state, dispatch] = useReducer(reducer, undefined, loadInitialState);
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const [identity, setIdentity] = useState<Identity>(loadIdentity);

    const signIn = useCallback(() => {
        setIdentity((prev) => {
            const next = signInIdentity(prev);
            saveIdentity(next);
            return next;
        });
    }, []);

    const signOut = useCallback(() => {
        setIdentity((prev) => {
            const next = signOutIdentity(prev);
            saveIdentity(next);
            return next;
        });
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch {
            // Storage full or unavailable — the app still works, just without persistence.
        }
    }, [state]);

    const dismissToast = useCallback((id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

    const toast = useCallback(
        (t: Omit<ToastMessage, "id">) => {
            const id = ++toastCounter;
            setToasts((prev) => [...prev.slice(-3), { ...t, id }]);
            window.setTimeout(() => dismissToast(id), 5200);
        },
        [dismissToast],
    );

    const value = useMemo(
        () => ({ state, dispatch, toast, toasts, dismissToast, identity, signIn, signOut }),
        [state, toast, toasts, dismissToast, identity, signIn, signOut],
    );

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = (): AppContextValue => {
    const ctx = useContext(AppContext);
    if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
    return ctx;
};
