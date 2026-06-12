import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, CheckCircle, Link01, MagicWand01, Send01, Stars01, UploadCloud01, Bank, Edit03, Cloud01 } from "@untitledui/icons";
import { useNavigate } from "react-router";
import { Avatar } from "@/components/base/avatar/avatar";
import { Badge, BadgeWithDot } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Tab, TabList, Tabs } from "@/components/application/tabs/tabs";
import { Tooltip, TooltipTrigger } from "@/components/base/tooltip/tooltip";
import { usePresence } from "@/hooks/use-presence";
import type { CursorEvent, RemoteEdit } from "@/hooks/use-presence";
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

/** Where a person's cursor should render: a cell anchor key plus a fractional offset inside it. */
interface CursorTarget {
    person: PresencePerson;
    /** data-cell key, e.g. "bs-cash:0" (value), "bs-cash:label", "head:1". */
    cellKey: string;
    fx: number;
    fy: number;
    /** True for the simulated solo-mode teammates. */
    sim?: boolean;
}

interface StackPerson {
    id: string;
    name: string;
    color: string;
    avatar?: string;
}

const personInitials = (name: string): string =>
    name
        .split(" ")
        .filter((word) => !word.startsWith("("))
        .map((word) => word[0])
        .slice(0, 2)
        .join("")
        .toUpperCase();

/** Avatar stack with hover tooltips. Shows at most 5 people; the rest collapse
    into a "+#" circle whose tooltip lists who they are. */
const PresenceStack = ({ people }: { people: StackPerson[] }) => {
    const MAX_VISIBLE = 5;
    const visible = people.slice(0, MAX_VISIBLE);
    const extra = people.slice(MAX_VISIBLE);

    return (
        <div className="flex -space-x-2">
            {visible.map((person) => (
                <Tooltip key={person.id} title={person.name} arrow>
                    <TooltipTrigger aria-label={person.name} className="rounded-full">
                        {person.avatar ? (
                            <Avatar src={person.avatar} alt={person.name} size="xs" className="ring-[1.5px] ring-bg-primary" />
                        ) : (
                            <span
                                className="flex size-6 items-center justify-center rounded-full text-[9px] font-bold text-white ring-[1.5px] ring-bg-primary"
                                style={{ backgroundColor: person.color }}
                            >
                                {personInitials(person.name)}
                            </span>
                        )}
                    </TooltipTrigger>
                </Tooltip>
            ))}
            {extra.length > 0 && (
                <Tooltip
                    title={`${extra.length} more ${extra.length === 1 ? "person" : "people"} online`}
                    description={extra.map((person) => person.name).join(", ")}
                    arrow
                >
                    <TooltipTrigger aria-label={`${extra.length} more people online`} className="rounded-full">
                        <span className="flex size-6 items-center justify-center rounded-full bg-secondary-solid text-[9px] font-bold text-white ring-[1.5px] ring-bg-primary">
                            +{extra.length}
                        </span>
                    </TooltipTrigger>
                </Tooltip>
            )}
        </div>
    );
};

const pickRandomCell = (statement: Statement): CellRef => {
    const candidates = statement.rows.filter((r) => r.kind !== "header");
    const row = candidates[Math.floor(Math.random() * candidates.length)];
    return { rowId: row.id, col: Math.floor(Math.random() * 2) };
};

/** Floating named cursor, Google-Sheets style. Position is driven imperatively by a
    requestAnimationFrame loop (no CSS transitions), so remote cursors glide at 60fps
    even though network updates arrive in bursts. */
const CollaboratorCursor = ({ person, cursorRef }: { person: PresencePerson; cursorRef: (el: HTMLDivElement | null) => void }) => (
    <div
        ref={cursorRef}
        className="pointer-events-none absolute top-0 left-0 z-30 will-change-transform"
        style={{ transform: "translate(-200px, -200px)" }}
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
    if (row.kind === "header") return <td data-cell={`${row.id}:tag`} />;

    return (
        <td data-cell={`${row.id}:tag`} className="px-3 py-1.5">
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
    const gridRef = useRef<HTMLDivElement>(null);
    /* Cursor animation state lives outside React: targets come from presence messages,
       a rAF loop eases the visible position toward them every frame. */
    const cursorEls = useRef<Map<string, HTMLDivElement>>(new Map());
    const cursorMotion = useRef<Record<string, { tx: number; ty: number; x: number; y: number; sim: boolean }>>({});

    /* Real-time presence: live cursors from anyone else on this page.
       Cursor packets arrive at network rate and are written straight into the
       animation loop (no React re-render); React state updates only when a peer
       changes cell (for selection rings) or joins/leaves. */
    const docStmtRef = useRef({ doc, stmtId: statement.id });
    docStmtRef.current = { doc, stmtId: statement.id };

    const computeCellPos = useCallback((cellKey: string, fx: number, fy: number) => {
        const grid = gridRef.current;
        if (!grid) return null;
        const cell = grid.querySelector(`[data-cell="${cellKey}"]`);
        if (!cell) return null;
        const gridRect = grid.getBoundingClientRect();
        const rect = cell.getBoundingClientRect();
        return {
            x: rect.left - gridRect.left + rect.width * fx + grid.scrollLeft,
            y: rect.top - gridRect.top + rect.height * fy + grid.scrollTop,
        };
    }, []);

    const peerCursorsRef = useRef<Record<string, CursorEvent>>({});
    const [peerCells, setPeerCells] = useState<Record<string, { id: string; name: string; color: string; cellKey: string; doc: string; stmtId: string }>>({});

    const onRemoteEdit = useCallback(
        (edit: RemoteEdit) => {
            dispatch({ type: "SET_CELL", doc: edit.doc as DocType, stmtId: edit.stmtId, rowId: edit.rowId, col: edit.col, value: edit.value });
        },
        [dispatch],
    );

    const onCursor = useCallback(
        (event: CursorEvent) => {
            peerCursorsRef.current[event.peer.id] = event;

            /* Fast path: update the animation target directly — no React involved. */
            const { doc: currentDoc, stmtId: currentStmt } = docStmtRef.current;
            if (event.cursor.doc === currentDoc && event.cursor.stmtId === currentStmt) {
                const pos = computeCellPos(event.cursor.cell, event.cursor.fx, event.cursor.fy);
                if (pos) {
                    const motion = cursorMotion.current[event.peer.id];
                    if (motion) {
                        motion.tx = pos.x;
                        motion.ty = pos.y;
                    } else {
                        cursorMotion.current[event.peer.id] = { tx: pos.x, ty: pos.y, x: pos.x, y: pos.y, sim: false };
                    }
                }
            }

            /* Slow path: re-render only when the hovered CELL (or identity) changes. */
            setPeerCells((prev) => {
                const existing = prev[event.peer.id];
                if (
                    existing &&
                    existing.cellKey === event.cursor.cell &&
                    existing.name === event.peer.name &&
                    existing.color === event.peer.color &&
                    existing.doc === event.cursor.doc &&
                    existing.stmtId === event.cursor.stmtId
                ) {
                    return prev;
                }
                return {
                    ...prev,
                    [event.peer.id]: {
                        id: event.peer.id,
                        name: event.peer.name,
                        color: event.peer.color,
                        cellKey: event.cursor.cell,
                        doc: event.cursor.doc,
                        stmtId: event.cursor.stmtId,
                    },
                };
            });
        },
        [computeCellPos],
    );

    const onLeave = useCallback((peerId: string) => {
        delete peerCursorsRef.current[peerId];
        delete cursorMotion.current[peerId];
        setPeerCells((prev) => {
            if (!(peerId in prev)) return prev;
            const next = { ...prev };
            delete next[peerId];
            return next;
        });
    }, []);

    const { peers, connected, sendCursor, sendEdit, room } = usePresence(identity, { onRemoteEdit, onCursor, onLeave });
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
                        cellKey: `${sel.rowId}:${sel.col}`,
                        fx: 0.35,
                        fy: 0.45,
                        sim: true,
                    });
            }
        }
        for (const pc of Object.values(peerCells)) {
            if (pc.doc === doc && pc.stmtId === statement.id) {
                const lastEvent = peerCursorsRef.current[pc.id];
                targets.push({
                    person: { id: pc.id, name: pc.name, color: pc.color },
                    cellKey: pc.cellKey,
                    fx: lastEvent?.cursor.fx ?? 0.5,
                    fy: lastEvent?.cursor.fy ?? 0.5,
                });
            }
        }
        return targets;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selections, peerCells, hasRealPeers, doc, statement.id]);

    /* Convert cell targets to pixel positions and feed them to the animation loop. */
    const updateCursorTargets = useCallback(() => {
        const grid = gridRef.current;
        if (!grid) return;
        const gridRect = grid.getBoundingClientRect();
        const sharedCount: Record<string, number> = {};
        const seen = new Set<string>();
        for (const target of cursorTargets) {
            const cell = grid.querySelector(`[data-cell="${target.cellKey}"]`);
            if (!cell) continue;
            /* Fan out only SIMULATED cursors that share a cell. Real cursors render at
               their exact reported position — offsetting them would read as snapping. */
            let fanX = 0;
            let fanY = 0;
            if (target.sim) {
                const stackIndex = sharedCount[target.cellKey] ?? 0;
                sharedCount[target.cellKey] = stackIndex + 1;
                fanX = stackIndex * 16;
                fanY = stackIndex * 6;
            }
            const rect = cell.getBoundingClientRect();
            const x = rect.left - gridRect.left + rect.width * target.fx + grid.scrollLeft + fanX;
            const y = rect.top - gridRect.top + rect.height * target.fy + grid.scrollTop + fanY;

            const id = target.person.id;
            seen.add(id);
            const motion = cursorMotion.current[id];
            if (!motion) {
                /* New cursor: appear in place rather than flying in from offscreen. */
                cursorMotion.current[id] = { tx: x, ty: y, x, y, sim: !!target.sim };
                cursorEls.current.get(id)?.style.setProperty("transform", `translate(${x}px, ${y}px)`);
            } else {
                motion.tx = x;
                motion.ty = y;
                motion.sim = !!target.sim;
            }
        }
        for (const id of Object.keys(cursorMotion.current)) {
            if (!seen.has(id)) delete cursorMotion.current[id];
        }
    }, [cursorTargets]);

    useLayoutEffect(() => {
        updateCursorTargets();
        window.addEventListener("resize", updateCursorTargets);
        return () => window.removeEventListener("resize", updateCursorTargets);
    }, [updateCursorTargets]);

    /* 60fps easing loop with time-based exponential smoothing: real cursors track
       tightly (~70ms time constant — hides network burst jitter without visible lag),
       sims drift lazily. Frame-rate independent. */
    useEffect(() => {
        let raf = 0;
        let last = performance.now();
        const tick = (now: number) => {
            const dt = Math.min(100, now - last);
            last = now;
            for (const [id, motion] of Object.entries(cursorMotion.current)) {
                const el = cursorEls.current.get(id);
                if (!el) continue;
                const tau = motion.sim ? 420 : 70;
                const k = 1 - Math.exp(-dt / tau);
                motion.x += (motion.tx - motion.x) * k;
                motion.y += (motion.ty - motion.y) * k;
                el.style.transform = `translate(${motion.x}px, ${motion.y}px)`;
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, []);

    /* Broadcast my own cursor as I move anywhere over the grid — every cell
       (labels, column headers, tags, sources) carries a data-cell anchor. */
    const handleGridMouseMove = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            const cell = (e.target as HTMLElement).closest?.("[data-cell]");
            if (!cell) return;
            const cellKey = cell.getAttribute("data-cell");
            if (!cellKey) return;
            const rect = cell.getBoundingClientRect();
            sendCursor({
                doc,
                stmtId: statement.id,
                cell: cellKey,
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
            (map[target.cellKey] ??= []).push(target.person);
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
                            <PresenceStack
                                people={[
                                    {
                                        id: "me",
                                        name: `${identity.isAccount ? CURRENT_USER.name : identity.name} (you)`,
                                        color: identity.color,
                                        avatar: identity.isAccount ? CURRENT_USER.avatar : undefined,
                                    },
                                    ...(hasRealPeers
                                        ? peerList.map((peer) => ({ id: peer.id, name: peer.name, color: peer.color }))
                                        : COLLABORATORS.map((c) => ({ id: c.id, name: c.name, color: c.color, avatar: c.avatar }))),
                                ]}
                            />
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
                {cursorTargets.map((target) => (
                    <CollaboratorCursor
                        key={target.person.id}
                        person={target.person}
                        cursorRef={(el) => {
                            if (el) cursorEls.current.set(target.person.id, el);
                            else cursorEls.current.delete(target.person.id);
                        }}
                    />
                ))}

                <table className="w-full min-w-[960px] border-collapse">
                    <thead className="sticky top-0 z-20 bg-secondary_subtle">
                        <tr className="border-b border-secondary text-left">
                            <th data-cell="head:label" className="px-4 py-2.5 text-xs font-semibold text-quaternary">
                                {statement.name} <span className="font-normal">(in thousands)</span>
                            </th>
                            {statement.columns.map((col, i) => (
                                <th key={col} data-cell={`head:${i}`} className="w-44 px-4 py-2.5 text-right text-xs font-semibold text-quaternary">
                                    {col}
                                </th>
                            ))}
                            <th data-cell="head:tag" className="w-78 px-3 py-2.5 text-xs font-semibold text-quaternary">
                                XBRL tag
                            </th>
                            <th data-cell="head:src" className="w-44 px-3 py-2.5 text-xs font-semibold text-quaternary max-lg:hidden">
                                Source
                            </th>
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
                                        data-cell={`${row.id}:label`}
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
                                    <td data-cell={`${row.id}:src`} className="px-3 py-2 max-lg:hidden">
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
