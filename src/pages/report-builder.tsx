import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, CheckCircle, Link01, MagicWand01, Send01, Stars01, UploadCloud01, Bank, Edit03, Cloud01 } from "@untitledui/icons";
import { useNavigate } from "react-router";
import { Avatar } from "@/components/base/avatar/avatar";
import { Badge, BadgeWithDot } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Tab, TabList, Tabs } from "@/components/application/tabs/tabs";
import { Tooltip } from "@/components/base/tooltip/tooltip";
import { usePresence } from "@/hooks/use-presence";
import type { RemoteEdit } from "@/hooks/use-presence";
import { identityInitials } from "@/lib/identity";
import { COLLABORATORS, CURRENT_USER } from "@/lib/initial-data";
import type { DocType, Statement, StatementRow } from "@/lib/types";
import { COMPANY, DOC_META, autoTag, conceptShortName, formatAccounting, isBalanced, resolveValue, tagStats } from "@/lib/xbrl";
import { useApp } from "@/store/app-context";
import { cx } from "@/utils/cx";

/* ---------------------------------- Presence ---------------------------------- */

/** The minimum shape needed to render a cursor or selection ring —
    satisfied by both simulated collaborators and real remote peers. */
interface PresencePerson {
    id: string;
    name: string;
    color: string;
    /** Short text for cursor pills and cell flags; defaults to the full name. */
    label?: string;
}

interface CellRef {
    rowId: string;
    col: number;
}

type SelectionMap = Record<string, CellRef>;

/** Where a person's cursor should render: a cell plus a fractional offset inside it. */
interface CursorTarget {
    person: PresencePerson;
    rowId: string;
    col: number;
    fx: number;
    fy: number;
    /** True for the simulated solo-mode teammates. */
    sim?: boolean;
}

const pickRandomCell = (statement: Statement): CellRef => {
    const candidates = statement.rows.filter((r) => r.kind !== "header");
    const row = candidates[Math.floor(Math.random() * candidates.length)];
    return { rowId: row.id, col: Math.floor(Math.random() * 2) };
};

/** Floating named cursor, Google-Sheets style. Simulated teammates glide slowly;
    real remote cursors track quickly so they feel live. */
const CollaboratorCursor = ({ person, x, y, sim }: { person: PresencePerson; x: number; y: number; sim?: boolean }) => (
    <div
        className={cx(
            "pointer-events-none absolute z-30 transition-all",
            sim ? "duration-[1600ms] ease-[cubic-bezier(0.22,1,0.36,1)]" : "duration-150 ease-linear",
        )}
        style={{ transform: `translate(${x}px, ${y}px)` }}
    >
        <svg width="14" height="16" viewBox="0 0 14 16" className="drop-shadow-sm">
            <path d="M1 1l5.2 13 1.9-5.4L13.5 7z" fill={person.color} stroke="white" strokeWidth="1" />
        </svg>
        <span
            className="absolute top-3.5 left-3 rounded-md rounded-tl-none px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap text-white shadow-sm"
            style={{ backgroundColor: person.color }}
        >
            {person.label ?? person.name}
        </span>
    </div>
);

/* ---------------------------------- Cells ---------------------------------- */

const SOURCE_ICONS = { file: UploadCloud01, gcs: Cloud01, bank: Bank, manual: Edit03 } as const;

const ValueCell = ({
    row,
    col,
    statement,
    onCommit,
    selectedBy,
}: {
    row: StatementRow;
    col: number;
    statement: Statement;
    onCommit: (value: number | null) => void;
    selectedBy?: PresencePerson[];
}) => {
    const isComputed = row.kind === "subtotal" || row.kind === "total";
    const value = resolveValue(statement, row.id, col);
    const [draft, setDraft] = useState<string | null>(null);

    if (row.kind === "header") return <td className="px-4 py-2" data-cell={`${row.id}:${col}`} />;

    const display = formatAccounting(value);
    /* One inset ring per selector, nested outside-in so every color stays visible. */
    const ring = selectedBy?.length
        ? { boxShadow: selectedBy.slice(0, 3).map((person, i) => `inset 0 0 0 ${(i + 1) * 2}px ${person.color}`).join(", ") }
        : undefined;

    return (
        <td className="relative p-0" data-cell={`${row.id}:${col}`}>
            <div className="relative" style={ring}>
                {selectedBy && selectedBy.length > 0 && (
                    <div className="absolute right-1 bottom-full z-10 flex translate-y-2 flex-row items-center gap-px">
                        {selectedBy.slice(0, 2).map((person) => (
                            <span
                                key={person.id}
                                className="rounded px-1 text-[9px] font-bold whitespace-nowrap text-white shadow-sm"
                                style={{ backgroundColor: person.color }}
                            >
                                {person.label ?? person.name}
                            </span>
                        ))}
                        {selectedBy.length > 2 && (
                            <span
                                className="rounded px-1 text-[9px] font-bold whitespace-nowrap text-white shadow-sm"
                                style={{ backgroundColor: "#0A1B3D" }}
                                title={selectedBy.slice(2).map((person) => person.name).join(", ")}
                            >
                                +{selectedBy.length - 2}
                            </span>
                        )}
                    </div>
                )}
                {isComputed ? (
                    <div
                        className={cx(
                            "px-4 py-2 text-right font-mono text-sm tabular-nums",
                            row.kind === "total" ? "font-bold text-primary" : "font-semibold text-primary",
                            value !== null && value < 0 && "text-error-primary",
                        )}
                    >
                        {display}
                    </div>
                ) : (
                    <input
                        value={draft ?? display}
                        onFocus={() => setDraft(value === null ? "" : String(value))}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={() => {
                            if (draft !== null) {
                                const cleaned = draft.replace(/[,$\s]/g, "").replace(/^\((.*)\)$/, "-$1");
                                const n = cleaned === "" ? null : Number(cleaned);
                                if (n === null || Number.isFinite(n)) onCommit(n);
                            }
                            setDraft(null);
                        }}
                        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                        aria-label={`${row.label} — ${statement.columns[col]}`}
                        className={cx(
                            "w-full bg-transparent px-4 py-2 text-right font-mono text-sm tabular-nums text-secondary outline-none",
                            "transition duration-100 ease-linear hover:bg-brand-25 focus:bg-brand-25 focus:ring-2 focus:ring-brand-500 focus:ring-inset",
                            value !== null && value < 0 && "text-error-primary",
                            value === null && "bg-warning-primary/40",
                        )}
                    />
                )}
            </div>
        </td>
    );
};

const TagCell = ({ row, onSuggest, onAccept, scanning }: { row: StatementRow; onSuggest: () => void; onAccept: () => void; scanning: boolean }) => {
    if (row.kind === "header") return <td />;

    return (
        <td className="px-3 py-1.5">
            {scanning ? (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-brand-50 px-2 py-1 font-mono text-xs text-brand-secondary">
                    <Stars01 className="size-3.5 animate-pulse" />
                    Analyzing…
                </span>
            ) : row.tag?.status === "accepted" ? (
                <Tooltip title={row.tag.concept} arrow>
                    <span className="inline-flex max-w-full cursor-default items-center gap-1.5 rounded-md bg-success-secondary px-2 py-1 font-mono text-xs font-medium text-success-primary ring-1 ring-success-200 ring-inset">
                        <Check className="size-3.5 shrink-0" />
                        <span className="truncate">{conceptShortName(row.tag.concept)}</span>
                    </span>
                </Tooltip>
            ) : row.tag?.status === "suggested" ? (
                <Tooltip title={`${row.tag.concept} — click to accept`} arrow>
                    <button
                        onClick={onAccept}
                        className="inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-md bg-brand-50 px-2 py-1 font-mono text-xs font-medium text-brand-secondary ring-1 ring-brand-300 ring-inset transition duration-100 ease-linear hover:bg-brand-100"
                    >
                        <Stars01 className="size-3.5 shrink-0" />
                        <span className="truncate">{conceptShortName(row.tag.concept)}</span>
                        <Badge size="sm" color="brand" type="pill-color" className="shrink-0">
                            {Math.round(row.tag.confidence * 100)}%
                        </Badge>
                    </button>
                </Tooltip>
            ) : (
                <button
                    onClick={onSuggest}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-quaternary opacity-0 ring-1 ring-secondary transition duration-100 ease-linear group-hover/row:opacity-100 hover:bg-brand-50 hover:text-brand-secondary"
                >
                    <MagicWand01 className="size-3.5" />
                    AI tag
                </button>
            )}
        </td>
    );
};

/* ---------------------------------- Page ---------------------------------- */

export const ReportBuilder = () => {
    const { state, dispatch, toast, identity } = useApp();
    const navigate = useNavigate();
    const doc = state.activeDoc;
    const statements = state.statements[doc];

    const [stmtId, setStmtId] = useState(statements[0].id);
    const statement = statements.find((s) => s.id === stmtId) ?? statements[0];

    const [aiRunning, setAiRunning] = useState(false);
    const [scanRowId, setScanRowId] = useState<string | null>(null);
    const [selections, setSelections] = useState<SelectionMap>({});
    const [cursors, setCursors] = useState<Record<string, { x: number; y: number }>>({});
    const gridRef = useRef<HTMLDivElement>(null);

    /* Real-time presence: live cursors from anyone else on this page. */
    const onRemoteEdit = useCallback(
        (edit: RemoteEdit) => {
            dispatch({ type: "SET_CELL", doc: edit.doc as DocType, stmtId: edit.stmtId, rowId: edit.rowId, col: edit.col, value: edit.value });
        },
        [dispatch],
    );
    const { peers, connected, sendCursor, sendEdit, room } = usePresence(identity, onRemoteEdit);
    const peerList = Object.values(peers);
    /* Simulated teammates only keep you company while you're alone. */
    const hasRealPeers = peerList.length > 0;

    const stats = tagStats(state, doc);
    const meta = DOC_META[doc];
    const balanced = isBalanced(statement);

    /* Simulated collaborators wander between cells (only when no real peers are here). */
    useEffect(() => {
        if (hasRealPeers) {
            setSelections({});
            return;
        }
        setSelections(Object.fromEntries(COLLABORATORS.map((c) => [c.id, pickRandomCell(statement)])));
        const timers = COLLABORATORS.map((c, i) =>
            window.setInterval(
                () =>
                    setSelections((prev) => {
                        /* Sometimes jump to a teammate's cell — co-selection is when name flags stack. */
                        const others = Object.entries(prev)
                            .filter(([id]) => id !== c.id)
                            .map(([, sel]) => sel);
                        const target = others.length && Math.random() < 0.28 ? others[Math.floor(Math.random() * others.length)] : pickRandomCell(statement);
                        return { ...prev, [c.id]: target };
                    }),
                3400 + i * 1300,
            ),
        );
        return () => timers.forEach(clearInterval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stmtId, doc, hasRealPeers]);

    /* Everyone whose cursor should render on this statement: sims when alone, real peers otherwise. */
    const cursorTargets = useMemo<CursorTarget[]>(() => {
        const targets: CursorTarget[] = [];
        if (!hasRealPeers) {
            for (const [collabId, sel] of Object.entries(selections)) {
                const person = COLLABORATORS.find((c) => c.id === collabId);
                if (person)
                    targets.push({
                        person: { ...person, label: person.name.split(" ")[0] },
                        rowId: sel.rowId,
                        col: sel.col,
                        fx: 0.35,
                        fy: 0.45,
                        sim: true,
                    });
            }
        }
        for (const peer of peerList) {
            if (peer.cursor && peer.cursor.doc === doc && peer.cursor.stmtId === statement.id) {
                targets.push({ person: peer, rowId: peer.cursor.rowId, col: peer.cursor.col, fx: peer.cursor.fx, fy: peer.cursor.fy });
            }
        }
        return targets;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selections, peers, hasRealPeers, doc, statement.id]);

    /* Convert cell targets to pixel cursor positions. */
    const positionCursors = useCallback(() => {
        const grid = gridRef.current;
        if (!grid) return;
        const gridRect = grid.getBoundingClientRect();
        setCursors(() => {
            const next: Record<string, { x: number; y: number }> = {};
            const sharedCount: Record<string, number> = {};
            for (const target of cursorTargets) {
                const cell = grid.querySelector(`[data-cell="${target.rowId}:${target.col}"]`);
                if (!cell) continue;
                /* Fan out cursors that share a cell so the arrows stay distinguishable. */
                const key = `${target.rowId}:${target.col}`;
                const stackIndex = sharedCount[key] ?? 0;
                sharedCount[key] = stackIndex + 1;
                const rect = cell.getBoundingClientRect();
                next[target.person.id] = {
                    x: rect.left - gridRect.left + rect.width * target.fx + grid.scrollLeft + stackIndex * 16,
                    y: rect.top - gridRect.top + rect.height * target.fy + grid.scrollTop + stackIndex * 6,
                };
            }
            return next;
        });
    }, [cursorTargets]);

    useLayoutEffect(() => {
        positionCursors();
        window.addEventListener("resize", positionCursors);
        return () => window.removeEventListener("resize", positionCursors);
    }, [positionCursors]);

    /* Broadcast my own cursor as I move over the grid. */
    const handleGridMouseMove = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            const cell = (e.target as HTMLElement).closest?.("[data-cell]");
            if (!cell) return;
            const [rowId, colStr] = (cell.getAttribute("data-cell") ?? "").split(":");
            if (!rowId) return;
            const rect = cell.getBoundingClientRect();
            sendCursor({
                doc,
                stmtId: statement.id,
                rowId,
                col: Number(colStr),
                fx: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
                fy: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
            });
        },
        [sendCursor, doc, statement.id],
    );

    /* Occasionally a simulated collaborator accepts a suggestion (solo mode only). */
    useEffect(() => {
        if (hasRealPeers) return;
        const timer = window.setInterval(() => {
            const suggested = statement.rows.filter((r) => r.tag?.status === "suggested");
            if (!suggested.length) return;
            const row = suggested[Math.floor(Math.random() * suggested.length)];
            const person = COLLABORATORS[Math.floor(Math.random() * COLLABORATORS.length)];
            dispatch({ type: "ACCEPT_TAG", doc, stmtId: statement.id, rowId: row.id });
            dispatch({ type: "LOG", actor: person.name, avatar: person.avatar, text: `accepted ${row.tag!.concept} on ${row.label}` });
            toast({ title: `${person.name} accepted a tag`, description: conceptShortName(row.tag!.concept), color: "brand" });
        }, 14000);
        return () => clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [statement, doc, hasRealPeers]);

    const runAiTagging = () => {
        const targets = statement.rows.filter((r) => r.kind !== "header" && !r.tag && autoTag(r.label));
        if (!targets.length) {
            toast({ title: "Nothing to tag", description: "Every line item on this statement already has an XBRL tag.", color: "brand" });
            return;
        }
        setAiRunning(true);
        let i = 0;
        const step = () => {
            if (i >= targets.length) {
                setScanRowId(null);
                setAiRunning(false);
                toast({
                    title: `Auto-tagged ${targets.length} line items`,
                    description: "Review the suggestions, then accept them individually or all at once.",
                    color: "success",
                });
                dispatch({ type: "LOG", actor: "Inline AI", text: `suggested ${targets.length} XBRL tags on the ${statement.name}` });
                return;
            }
            const row = targets[i];
            setScanRowId(row.id);
            window.setTimeout(() => {
                dispatch({ type: "SET_TAG", doc, stmtId: statement.id, rowId: row.id, tag: autoTag(row.label)! });
                i++;
                step();
            }, 420);
        };
        step();
    };

    const acceptAll = () => {
        dispatch({ type: "ACCEPT_ALL_TAGS", doc });
        dispatch({ type: "COMPLETE_TASK", id: doc === "10-Q" ? "t5" : "k3" });
        dispatch({ type: "LOG", actor: CURRENT_USER.name, avatar: CURRENT_USER.avatar, text: `accepted all AI tag suggestions on the ${doc}` });
        toast({ title: "All suggestions accepted", description: "Tag coverage updated across the document.", color: "success" });
    };

    const selectionByRow = useMemo(() => {
        const map: Record<string, PresencePerson[]> = {};
        for (const target of cursorTargets) {
            (map[`${target.rowId}:${target.col}`] ??= []).push(target.person);
        }
        return map;
    }, [cursorTargets]);

    return (
        <div className="flex h-[calc(100dvh-56px)] flex-col lg:h-dvh">
            {/* Builder header */}
            <div className="flex flex-col gap-4 border-b border-secondary bg-primary px-4 pt-5 pb-0 lg:px-8">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2.5">
                            <h1 className="text-xl font-semibold text-primary">Form {doc}</h1>
                            <Badge color="blue" size="sm" type="pill-color">
                                {meta.period}
                            </Badge>
                            <BadgeWithDot color="success" size="sm" type="modern" className="max-sm:hidden">
                                Autosaved
                            </BadgeWithDot>
                        </div>
                        <p className="text-sm text-tertiary">
                            {COMPANY.name} · period ended {meta.periodEnd} · due {meta.due}
                        </p>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Live presence: you + real peers (or simulated teammates while alone) */}
                        <div className="flex items-center gap-2">
                            <div className="flex -space-x-2">
                                {identity.isAccount ? (
                                    <Avatar src={CURRENT_USER.avatar} alt={CURRENT_USER.name} size="xs" className="ring-[1.5px] ring-bg-primary" />
                                ) : (
                                    <span
                                        title={`${identity.name} (you)`}
                                        className="flex size-6 items-center justify-center rounded-full text-[9px] font-bold text-white ring-[1.5px] ring-bg-primary"
                                        style={{ backgroundColor: identity.color }}
                                    >
                                        {identityInitials(identity)}
                                    </span>
                                )}
                                {hasRealPeers
                                    ? peerList.map((peer) => (
                                          <span
                                              key={peer.id}
                                              title={peer.name}
                                              className="flex size-6 items-center justify-center rounded-full text-[9px] font-bold text-white ring-[1.5px] ring-bg-primary"
                                              style={{ backgroundColor: peer.color }}
                                          >
                                              {peer.name
                                                  .split(" ")
                                                  .map((w) => w[0])
                                                  .slice(0, 2)
                                                  .join("")
                                                  .toUpperCase()}
                                          </span>
                                      ))
                                    : COLLABORATORS.map((c) => <Avatar key={c.id} src={c.avatar} alt={c.name} size="xs" className="ring-[1.5px] ring-bg-primary" />)}
                            </div>
                            <BadgeWithDot color={connected ? "success" : "gray"} size="sm" type="pill-color">
                                {connected ? `${(hasRealPeers ? peerList.length : COLLABORATORS.length) + 1} online` : "Connecting…"}
                            </BadgeWithDot>
                            <Tooltip title={`Share this link — visitors join room “${room}” as anonymous guests`} arrow>
                                <Button
                                    size="sm"
                                    color="tertiary"
                                    iconLeading={Link01}
                                    onClick={() => {
                                        navigator.clipboard.writeText(window.location.href);
                                        toast({ title: "Link copied", description: "Anyone who opens it joins this report builder live.", color: "brand" });
                                    }}
                                >
                                    Copy link
                                </Button>
                            </Tooltip>
                        </div>

                        <div className="flex gap-2">
                            {stats.suggested > 0 && (
                                <Button size="sm" color="secondary" iconLeading={Check} onClick={acceptAll}>
                                    Accept all ({stats.suggested})
                                </Button>
                            )}
                            <Button size="sm" color="primary" iconLeading={MagicWand01} isLoading={aiRunning} showTextWhileLoading onClick={runAiTagging}>
                                {aiRunning ? "Tagging…" : "Run AI auto-tag"}
                            </Button>
                            <Button size="sm" color="secondary" iconLeading={Send01} onClick={() => navigate("/filings")}>
                                Export
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Document + statement tabs */}
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <Tabs selectedKey={stmtId} onSelectionChange={(k) => setStmtId(String(k))} className="w-auto">
                        <TabList type="underline" size="sm">
                            {statements.map((s) => (
                                <Tab key={s.id} id={s.id}>
                                    {s.name}
                                </Tab>
                            ))}
                        </TabList>
                    </Tabs>

                    <Tabs
                        selectedKey={doc}
                        onSelectionChange={(k) => {
                            dispatch({ type: "SET_DOC", doc: k as DocType });
                            setStmtId("balance-sheet");
                        }}
                        className="mb-2 w-auto"
                    >
                        <TabList type="button-border" size="sm">
                            <Tab id="10-Q">10-Q</Tab>
                            <Tab id="10-K">10-K</Tab>
                        </TabList>
                    </Tabs>
                </div>
            </div>

            {/* Spreadsheet grid */}
            <div ref={gridRef} onMouseMove={handleGridMouseMove} className="relative flex-1 overflow-auto bg-primary">
                {/* Collaborator cursors — simulated teammates or real remote visitors */}
                {cursorTargets.map(
                    (target) =>
                        cursors[target.person.id] && (
                            <CollaboratorCursor
                                key={target.person.id}
                                person={target.person}
                                x={cursors[target.person.id].x}
                                y={cursors[target.person.id].y}
                                sim={target.sim}
                            />
                        ),
                )}

                <table className="w-full min-w-[960px] border-collapse">
                    <thead className="sticky top-0 z-20 bg-secondary_subtle">
                        <tr className="border-b border-secondary text-left">
                            <th className="px-4 py-2.5 text-xs font-semibold text-quaternary">
                                {statement.name} <span className="font-normal">(in thousands)</span>
                            </th>
                            {statement.columns.map((col) => (
                                <th key={col} className="w-44 px-4 py-2.5 text-right text-xs font-semibold text-quaternary">
                                    {col}
                                </th>
                            ))}
                            <th className="w-78 px-3 py-2.5 text-xs font-semibold text-quaternary">XBRL tag</th>
                            <th className="w-44 px-3 py-2.5 text-xs font-semibold text-quaternary max-lg:hidden">Source</th>
                        </tr>
                    </thead>
                    <tbody>
                        {statement.rows.map((row) => {
                            const SourceIcon = row.sourceKind ? SOURCE_ICONS[row.sourceKind] : null;
                            return (
                                <tr
                                    key={row.id}
                                    className={cx(
                                        "group/row border-b border-tertiary transition duration-100 ease-linear",
                                        row.kind === "header" && "bg-secondary_subtle",
                                        row.kind === "total" && "border-t-2 border-b-2 border-secondary",
                                        scanRowId === row.id && "bg-brand-50",
                                    )}
                                >
                                    <td
                                        className={cx(
                                            "px-4 py-2 text-sm",
                                            row.kind === "header" && "pt-3 font-semibold text-primary",
                                            row.kind === "line" && "text-secondary",
                                            row.kind === "subtotal" && "font-semibold text-primary",
                                            row.kind === "total" && "font-bold text-primary",
                                        )}
                                        style={{ paddingLeft: `${16 + row.indent * 16}px` }}
                                    >
                                        {row.label}
                                    </td>
                                    {statement.columns.map((_, col) => (
                                        <ValueCell
                                            key={col}
                                            row={row}
                                            col={col}
                                            statement={statement}
                                            selectedBy={selectionByRow[`${row.id}:${col}`]}
                                            onCommit={(value) => {
                                                dispatch({ type: "SET_CELL", doc, stmtId: statement.id, rowId: row.id, col, value });
                                                sendEdit({ doc, stmtId: statement.id, rowId: row.id, col, value });
                                            }}
                                        />
                                    ))}
                                    <TagCell
                                        row={row}
                                        scanning={scanRowId === row.id}
                                        onSuggest={() => {
                                            const tag = autoTag(row.label);
                                            if (tag) dispatch({ type: "SET_TAG", doc, stmtId: statement.id, rowId: row.id, tag });
                                            else toast({ title: "No concept match", description: "The AI couldn’t map this label to US-GAAP.", color: "warning" });
                                        }}
                                        onAccept={() => dispatch({ type: "ACCEPT_TAG", doc, stmtId: statement.id, rowId: row.id })}
                                    />
                                    <td className="px-3 py-2 max-lg:hidden">
                                        {row.kind !== "header" && row.source && (
                                            <span className="inline-flex max-w-full items-center gap-1.5 text-xs text-tertiary">
                                                {SourceIcon && <SourceIcon className="size-3.5 shrink-0 text-fg-quaternary" />}
                                                <span className="truncate">{row.source}</span>
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Status footer */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-secondary bg-primary px-4 py-3 lg:px-8">
                <div className="flex items-center gap-4">
                    {statement.id === "balance-sheet" &&
                        (balanced ? (
                            <span className="flex items-center gap-1.5 text-sm font-medium text-success-primary">
                                <CheckCircle className="size-4" /> In balance — Assets = Liabilities + Equity
                            </span>
                        ) : (
                            <span className="flex items-center gap-1.5 text-sm font-medium text-warning-primary">
                                <AlertCircle className="size-4" /> Out of balance — missing values. Import the Q2 trial balance from Data Sources.
                            </span>
                        ))}
                </div>
                <p className="text-sm text-tertiary">
                    <span className="font-semibold text-brand-secondary">{stats.coverage}%</span> tag coverage · {stats.tagged}/{stats.taggable} tagged ·{" "}
                    {stats.suggested} suggested
                </p>
            </div>
        </div>
    );
};
