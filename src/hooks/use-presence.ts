import { useCallback, useEffect, useRef, useState } from "react";
import mqtt from "mqtt";
import type { Identity } from "@/lib/identity";

/**
 * Real-time presence over MQTT-over-WebSockets, using a public broker so the
 * demo needs no backend or API keys. Everyone on the same room topic sees each
 * other's cursors live. Messages are unauthenticated and public — demo data only.
 *
 * Performance: cursor packets bypass React state entirely — they stream to the
 * `onCursor` callback so the consumer can drive animations imperatively. React
 * state (`peers`) changes only when someone joins, leaves, or renames.
 */
const BROKER_URL = "wss://broker.emqx.io:8084/mqtt";

const room = new URLSearchParams(window.location.search).get("room") ?? "main";
const TOPIC = `inline-xbrl-demo/${room}/v2`;

const HEARTBEAT_MS = 4000;
const PEER_TIMEOUT_MS = 12000;
/* ~40 updates/sec — receivers interpolate between them, so motion reads as realtime. */
const CURSOR_THROTTLE_MS = 25;

export interface PeerCursor {
    stmtId: string;
    doc: string;
    /** The data-cell anchor key under the pointer — any cell in the grid,
        e.g. "bs-cash:0", "bs-cash:label", "head:1". */
    cell: string;
    /** Fractional position inside the cell, so layout differences don't matter. */
    fx: number;
    fy: number;
}

export interface Peer {
    id: string;
    name: string;
    color: string;
    isAccount: boolean;
}

export interface RemoteEdit {
    doc: string;
    stmtId: string;
    rowId: string;
    col: number;
    value: number | null;
}

export interface CursorEvent {
    peer: Peer;
    cursor: PeerCursor;
}

/** A cell someone is actively working in (clicked/focused) — null clears it. */
export interface PeerSelection {
    doc: string;
    stmtId: string;
    cell: string;
}

export interface SelectEvent {
    peer: Peer;
    selection: PeerSelection | null;
}

type WireMessage =
    | { t: "hello"; id: string; name: string; color: string; acct: boolean }
    | { t: "bye"; id: string }
    | ({ t: "cur"; id: string; name: string; color: string; acct: boolean } & PeerCursor)
    | { t: "sel"; id: string; name: string; color: string; acct: boolean; sel: PeerSelection | null }
    | { t: "edit"; id: string; doc: string; stmtId: string; rowId: string; col: number; value: number | null };

export interface PresenceHandlers {
    onRemoteEdit: (edit: RemoteEdit) => void;
    /** Fired for every cursor packet — called outside React state, at network rate. */
    onCursor: (event: CursorEvent) => void;
    /** Fired when a peer clicks into (or leaves) a cell. */
    onSelect: (event: SelectEvent) => void;
    /** Fired when a peer disconnects or times out. */
    onLeave?: (peerId: string) => void;
}

export const usePresence = (identity: Identity, handlers: PresenceHandlers) => {
    const [peers, setPeers] = useState<Record<string, Peer>>({});
    const [connected, setConnected] = useState(false);
    const clientRef = useRef<mqtt.MqttClient | null>(null);
    const identityRef = useRef(identity);
    identityRef.current = identity;
    const handlersRef = useRef(handlers);
    handlersRef.current = handlers;
    const lastSeenRef = useRef<Record<string, number>>({});
    const lastCursorSent = useRef(0);
    const pendingCursor = useRef<PeerCursor | null>(null);
    const flushTimer = useRef<number | null>(null);
    const mySelection = useRef<PeerSelection | null>(null);

    /* Cursors are fire-and-forget (qos 0); edits and selections matter, so they
       use acknowledged delivery (qos 1) — a single dropped packet won't lose them. */
    const publish = useCallback((msg: WireMessage, qos: 0 | 1 = 0) => {
        const client = clientRef.current;
        if (client?.connected) client.publish(TOPIC, JSON.stringify(msg), { qos });
    }, []);

    const hello = useCallback(() => {
        const me = identityRef.current;
        publish({ t: "hello", id: me.id, name: me.name, color: me.color, acct: me.isAccount });
        /* Late joiners need to learn about an already-active selection. */
        if (mySelection.current) {
            publish({ t: "sel", id: me.id, name: me.name, color: me.color, acct: me.isAccount, sel: mySelection.current });
        }
    }, [publish]);

    const removePeer = useCallback((id: string) => {
        delete lastSeenRef.current[id];
        setPeers((prev) => {
            if (!(id in prev)) return prev;
            const next = { ...prev };
            delete next[id];
            return next;
        });
        handlersRef.current.onLeave?.(id);
    }, []);

    useEffect(() => {
        const client = mqtt.connect(BROKER_URL, {
            /* Random suffix: avoids clientId collisions when React StrictMode double-mounts. */
            clientId: `inline-${identityRef.current.id.slice(0, 8)}-${Math.random().toString(36).slice(2, 8)}`,
            keepalive: 30,
            reconnectPeriod: 3000,
            connectTimeout: 8000,
        });
        clientRef.current = client;

        client.on("connect", () => {
            setConnected(true);
            client.subscribe(TOPIC);
            hello();
        });
        client.on("close", () => setConnected(false));
        client.on("error", () => {
            /* reconnects automatically; offline mode just shows no peers */
        });

        client.on("message", (_topic, payload) => {
            let msg: WireMessage;
            try {
                msg = JSON.parse(payload.toString()) as WireMessage;
            } catch {
                return;
            }
            if (msg.id === identityRef.current.id) return; // own echo

            if (msg.t === "bye") {
                removePeer(msg.id);
                return;
            }
            lastSeenRef.current[msg.id] = Date.now();

            if (msg.t === "edit") {
                handlersRef.current.onRemoteEdit({ doc: msg.doc, stmtId: msg.stmtId, rowId: msg.rowId, col: msg.col, value: msg.value });
                return;
            }

            /* hello | cur | sel: keep the roster in sync, but only re-render React
               when someone new joins or an identity actually changes. */
            const peer: Peer = { id: msg.id, name: msg.name, color: msg.color, isAccount: msg.acct };
            setPeers((prev) => {
                const existing = prev[msg.id];
                if (existing && existing.name === peer.name && existing.color === peer.color && existing.isAccount === peer.isAccount) {
                    return prev;
                }
                // Announce ourselves to newcomers so they get the roster instantly.
                if (!existing) hello();
                return { ...prev, [msg.id]: peer };
            });

            if (msg.t === "cur") {
                handlersRef.current.onCursor({ peer, cursor: { stmtId: msg.stmtId, doc: msg.doc, cell: msg.cell, fx: msg.fx, fy: msg.fy } });
            } else if (msg.t === "sel") {
                handlersRef.current.onSelect({ peer, selection: msg.sel });
            }
        });

        const heartbeat = window.setInterval(hello, HEARTBEAT_MS);
        const reaper = window.setInterval(() => {
            const now = Date.now();
            for (const [id, seen] of Object.entries(lastSeenRef.current)) {
                if (now - seen > PEER_TIMEOUT_MS) removePeer(id);
            }
        }, 3000);

        const bye = () => publish({ t: "bye", id: identityRef.current.id });
        window.addEventListener("beforeunload", bye);

        return () => {
            window.clearInterval(heartbeat);
            window.clearInterval(reaper);
            window.removeEventListener("beforeunload", bye);
            if (flushTimer.current !== null) window.clearTimeout(flushTimer.current);
            bye();
            client.end(true);
            clientRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* Re-announce immediately when the identity changes (e.g. sign in/out). */
    useEffect(() => {
        hello();
    }, [identity.name, identity.color, identity.isAccount, hello]);

    const sendCursor = useCallback(
        (cursor: PeerCursor) => {
            const sendNow = (c: PeerCursor) => {
                lastCursorSent.current = Date.now();
                const me = identityRef.current;
                publish({ t: "cur", id: me.id, name: me.name, color: me.color, acct: me.isAccount, ...c });
            };

            const elapsed = Date.now() - lastCursorSent.current;
            if (elapsed >= CURSOR_THROTTLE_MS) {
                sendNow(cursor);
                return;
            }
            /* Trailing flush: the final resting position always goes out. */
            pendingCursor.current = cursor;
            if (flushTimer.current === null) {
                flushTimer.current = window.setTimeout(() => {
                    flushTimer.current = null;
                    if (pendingCursor.current) {
                        sendNow(pendingCursor.current);
                        pendingCursor.current = null;
                    }
                }, CURSOR_THROTTLE_MS - elapsed);
            }
        },
        [publish],
    );

    const sendEdit = useCallback(
        (edit: RemoteEdit) => {
            const msg: WireMessage = { t: "edit", id: identityRef.current.id, ...edit };
            publish(msg, 1);
            /* SET_CELL is idempotent, so re-send once — covers a receiver that was
               mid-reconnect on the public broker when the first copy went out. */
            window.setTimeout(() => publish(msg, 1), 700);
        },
        [publish],
    );

    /** Broadcast which cell I'm working in (null = stopped editing). */
    const sendSelect = useCallback(
        (selection: PeerSelection | null) => {
            mySelection.current = selection;
            const me = identityRef.current;
            publish({ t: "sel", id: me.id, name: me.name, color: me.color, acct: me.isAccount, sel: selection }, 1);
        },
        [publish],
    );

    return { peers, connected, sendCursor, sendEdit, sendSelect, room };
};
