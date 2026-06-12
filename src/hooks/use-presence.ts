import { useCallback, useEffect, useRef, useState } from "react";
import mqtt from "mqtt";
import { Peer as PeerJsClient } from "peerjs";
import type { DataConnection } from "peerjs";
import type { Identity } from "@/lib/identity";

/**
 * Real-time presence with a two-tier transport, no backend or API keys:
 *
 * 1. MQTT over WebSockets (public broker) — roster, selections, edits, and
 *    cursor-trail fallback. Reliable but rate-limited.
 * 2. WebRTC data channels via PeerJS Cloud (free public brokering API) — raw
 *    mouse input streamed peer-to-peer at event rate (~60–120Hz, unordered,
 *    no retransmits). This is what makes remote cursors feel Figma-live.
 *    Peers discover each other's PeerJS ids through MQTT hellos; if a P2P
 *    connection can't form (strict NAT), the MQTT trail fallback covers it.
 *
 * Cursor packets bypass React state entirely — they stream to the `onCursor`
 * callback so the consumer can drive animations imperatively. React state
 * (`peers`) changes only when someone joins, leaves, or renames.
 */
const BROKER_URL = "wss://broker.emqx.io:8084/mqtt";

const room = new URLSearchParams(window.location.search).get("room") ?? "main";
const TOPIC = `inline-xbrl-demo/${room}/v3`;

const HEARTBEAT_MS = 4000;
/* Generous: Chrome throttles hidden-tab timers down to ~1/min, and reaping someone
   who merely switched windows would wipe their cursor and selection for everyone.
   Dead connections are cleaned up promptly by the MQTT Last-Will instead. */
const PEER_TIMEOUT_MS = 70000;
/* Cursor positions are sampled every SAMPLE_MS but shipped as batched trails every
   FLUSH_MS — the public broker rate-limits (and drops) rapid individual publishes,
   while ~10 packets/sec sails through. Receivers replay the timestamped trail, so
   path fidelity stays at full sampling rate. */
const CURSOR_SAMPLE_MS = 25;
const CURSOR_FLUSH_MS = 100;
const TRAIL_MAX_POINTS = 6;
/* P2P mouse stream cap (~120Hz). */
const P2P_SEND_MIN_MS = 8;

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

/** One timestamped point of a cursor trail. */
export interface TrailPoint {
    cell: string;
    fx: number;
    fy: number;
    /** Sender-side performance.now() — preserves the temporal shape of the motion. */
    ts: number;
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
    doc: string;
    stmtId: string;
    /** The batched trail, oldest point first. */
    points: TrailPoint[];
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
    | { t: "hello"; id: string; name: string; color: string; acct: boolean; pj?: string }
    | { t: "bye"; id: string }
    | { t: "cur"; id: string; name: string; color: string; acct: boolean; doc: string; stmtId: string; pts: TrailPoint[] }
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
    /* Mirror of `peers` readable from network callbacks without re-subscribing. */
    const peersRef = useRef<Record<string, Peer>>({});
    /* WebRTC mouse-stream plumbing. */
    const peerJsRef = useRef<PeerJsClient | null>(null);
    const peerJsId = useRef(`inx-${Math.random().toString(36).slice(2, 12)}`);
    const channelsRef = useRef<Map<string, DataConnection>>(new Map());
    const p2pInboundRef = useRef<Map<string, number>>(new Map());
    const lastP2pSent = useRef(0);
    const p2pTailTimer = useRef<number | null>(null);
    const lastCursorSampled = useRef(0);
    const trail = useRef<TrailPoint[]>([]);
    const trailContext = useRef<{ doc: string; stmtId: string } | null>(null);
    /* Position throttled away between samples — appended at flush so the cursor's
       final resting point is always exact. */
    const pendingPoint = useRef<TrailPoint | null>(null);
    const flushTimer = useRef<number | null>(null);
    const mySelection = useRef<PeerSelection | null>(null);

    /* Cursors are fire-and-forget (qos 0); edits and selections matter, so they
       use acknowledged delivery (qos 1) — a single dropped packet won't lose them. */
    const publish = useCallback((msg: WireMessage, qos: 0 | 1 = 0) => {
        const client = clientRef.current;
        if (client?.connected) client.publish(TOPIC, JSON.stringify(msg), { qos });
    }, []);

    /* ----- WebRTC mouse-stream channels (PeerJS Cloud) ----- */

    /** Visible in the console (and used by tests): number of live P2P mouse streams. */
    const updateP2pDebug = useCallback(() => {
        let open = 0;
        for (const c of channelsRef.current.values()) if (c.open) open++;
        (window as unknown as { __inlineP2P?: number }).__inlineP2P = open;
    }, []);

    const attachChannel = useCallback((remoteId: string, conn: DataConnection) => {
        const existing = channelsRef.current.get(remoteId);
        if (existing && existing.open) {
            conn.close();
            return;
        }
        existing?.close();
        channelsRef.current.set(remoteId, conn);
        conn.on("open", updateP2pDebug);

        conn.on("data", (raw) => {
            const d = raw as { cell?: unknown; fx?: unknown; fy?: unknown; ts?: unknown; doc?: unknown; stmtId?: unknown };
            if (typeof d?.cell !== "string" || typeof d.doc !== "string" || typeof d.stmtId !== "string") return;
            if (!Number.isFinite(d.fx) || !Number.isFinite(d.fy) || !Number.isFinite(d.ts)) return;
            p2pInboundRef.current.set(remoteId, Date.now());
            const peerInfo = peersRef.current[remoteId];
            if (!peerInfo) return; // roster catches up via the next hello
            handlersRef.current.onCursor({
                peer: peerInfo,
                doc: d.doc,
                stmtId: d.stmtId,
                points: [{ cell: d.cell, fx: d.fx as number, fy: d.fy as number, ts: d.ts as number }],
            });
        });
        const drop = () => {
            if (channelsRef.current.get(remoteId) === conn) channelsRef.current.delete(remoteId);
            updateP2pDebug();
        };
        conn.on("close", drop);
        conn.on("error", drop);
    }, [updateP2pDebug]);

    /** The lexicographically smaller identity initiates, so both sides don't dial at once. */
    const maybeDial = useCallback(
        (remoteId: string, remotePjId: string) => {
            const peer = peerJsRef.current;
            if (!peer || peer.destroyed || !peer.open) return;
            if (identityRef.current.id >= remoteId) return;
            const existing = channelsRef.current.get(remoteId);
            if (existing && (existing.open || existing.peer === remotePjId)) return;
            try {
                const conn = peer.connect(remotePjId, {
                    reliable: false, // unordered, no retransmits — lowest latency; drops are fine for cursors
                    serialization: "json",
                    metadata: { id: identityRef.current.id },
                });
                attachChannel(remoteId, conn);
            } catch {
                /* P2P is best-effort; the MQTT trail fallback covers this peer. */
            }
        },
        [attachChannel],
    );

    const hello = useCallback(() => {
        const me = identityRef.current;
        publish({ t: "hello", id: me.id, name: me.name, color: me.color, acct: me.isAccount, pj: peerJsId.current });
        /* Replay the full selection state (including "none") every heartbeat: late
           joiners learn about active selections, and a receiver that missed a clear
           self-heals instead of showing a stuck ring. */
        publish({ t: "sel", id: me.id, name: me.name, color: me.color, acct: me.isAccount, sel: mySelection.current });
    }, [publish]);

    const removePeer = useCallback((id: string) => {
        delete lastSeenRef.current[id];
        channelsRef.current.get(id)?.close();
        channelsRef.current.delete(id);
        p2pInboundRef.current.delete(id);
        setPeers((prev) => {
            if (!(id in prev)) return prev;
            const next = { ...prev };
            delete next[id];
            peersRef.current = next;
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
            /* Last-Will: if the connection dies (closed laptop, killed tab), the broker
               broadcasts our departure so peers don't stare at a ghost cursor. */
            will: {
                topic: TOPIC,
                payload: JSON.stringify({ t: "bye", id: identityRef.current.id }),
                qos: 1,
                retain: false,
            },
        });
        clientRef.current = client;

        /* PeerJS Cloud client for direct mouse-stream channels. */
        const pjs = new PeerJsClient(peerJsId.current, { debug: 0 });
        peerJsRef.current = pjs;
        pjs.on("open", () => {
            /* Announce again now that we're dialable. */
            hello();
        });
        pjs.on("connection", (conn) => {
            const remoteId = (conn.metadata as { id?: unknown } | undefined)?.id;
            if (typeof remoteId === "string") attachChannel(remoteId, conn);
            else conn.close();
        });
        pjs.on("error", () => {
            /* Best-effort: peers without a P2P path fall back to MQTT trails. */
        });

        client.on("connect", () => {
            setConnected(true);
            /* qos 1 on the subscription too — publisher qos is capped by it, and
               selection/edit messages rely on at-least-once delivery. */
            client.subscribe(TOPIC, { qos: 1 });
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
                const next = { ...prev, [msg.id]: peer };
                peersRef.current = next;
                return next;
            });

            if (msg.t === "hello" && typeof msg.pj === "string") {
                maybeDial(msg.id, msg.pj);
            }

            if (msg.t === "cur") {
                /* A live P2P stream supersedes the MQTT trail for this peer. */
                if (Date.now() - (p2pInboundRef.current.get(msg.id) ?? 0) < 2000) return;
                if (Array.isArray(msg.pts) && msg.pts.length > 0) {
                    handlersRef.current.onCursor({ peer, doc: msg.doc, stmtId: msg.stmtId, points: msg.pts });
                }
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

        /* Coming back from a background tab or another window: re-announce right
           away (heartbeats may have been throttled while hidden). */
        const reannounce = () => {
            if (!document.hidden) hello();
        };
        document.addEventListener("visibilitychange", reannounce);
        window.addEventListener("focus", reannounce);

        return () => {
            window.clearInterval(heartbeat);
            window.clearInterval(reaper);
            window.removeEventListener("beforeunload", bye);
            document.removeEventListener("visibilitychange", reannounce);
            window.removeEventListener("focus", reannounce);
            if (flushTimer.current !== null) window.clearTimeout(flushTimer.current);
            bye();
            client.end(true);
            clientRef.current = null;
            pjs.destroy();
            peerJsRef.current = null;
            channelsRef.current.clear();
            p2pInboundRef.current.clear();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* Re-announce immediately when the identity changes (e.g. sign in/out). */
    useEffect(() => {
        hello();
    }, [identity.name, identity.color, identity.isAccount, hello]);

    const flushTrail = useCallback(() => {
        if (flushTimer.current !== null) {
            window.clearTimeout(flushTimer.current);
            flushTimer.current = null;
        }
        if (pendingPoint.current) {
            trail.current.push(pendingPoint.current);
            pendingPoint.current = null;
        }
        const context = trailContext.current;
        if (!context || trail.current.length === 0) return;
        const me = identityRef.current;
        publish({
            t: "cur",
            id: me.id,
            name: me.name,
            color: me.color,
            acct: me.isAccount,
            doc: context.doc,
            stmtId: context.stmtId,
            pts: trail.current,
        });
        trail.current = [];
    }, [publish]);

    /** Stream the cursor: P2P at near-event rate to every open channel, with the
        MQTT trail as fallback for peers we couldn't reach directly. */
    const sendCursor = useCallback(
        (cursor: PeerCursor) => {
            const now = performance.now();

            /* P2P fast path. */
            if (now - lastP2pSent.current >= P2P_SEND_MIN_MS) {
                let sentAny = false;
                for (const conn of channelsRef.current.values()) {
                    if (conn.open) {
                        try {
                            conn.send({ ...cursor, ts: Math.round(now) });
                            sentAny = true;
                        } catch {
                            /* channel died mid-send; close handler cleans up */
                        }
                    }
                }
                if (sentAny) {
                    lastP2pSent.current = now;
                    /* The channel is unordered/no-retransmit: repeat the final resting
                       position once so a dropped last packet can't strand the cursor. */
                    if (p2pTailTimer.current !== null) window.clearTimeout(p2pTailTimer.current);
                    p2pTailTimer.current = window.setTimeout(() => {
                        p2pTailTimer.current = null;
                        for (const conn of channelsRef.current.values()) {
                            if (conn.open) {
                                try {
                                    conn.send({ ...cursor, ts: Math.round(performance.now()) });
                                } catch {
                                    /* best-effort */
                                }
                            }
                        }
                    }, 160);
                }
            }

            /* Skip the MQTT trail only when every known peer has a live channel. */
            const roster = Object.keys(peersRef.current);
            const allCovered = roster.length > 0 && roster.every((id) => channelsRef.current.get(id)?.open);
            if (allCovered) return;

            if (now - lastCursorSampled.current < CURSOR_SAMPLE_MS) {
                /* Keep the freshest throttled-away point for the flush. */
                pendingPoint.current = { cell: cursor.cell, fx: cursor.fx, fy: cursor.fy, ts: Math.round(now) };
                return;
            }
            lastCursorSampled.current = now;
            pendingPoint.current = null;

            /* Statement switched mid-trail: ship what we have, start fresh. */
            const context = trailContext.current;
            if (context && (context.doc !== cursor.doc || context.stmtId !== cursor.stmtId)) flushTrail();
            trailContext.current = { doc: cursor.doc, stmtId: cursor.stmtId };

            trail.current.push({ cell: cursor.cell, fx: cursor.fx, fy: cursor.fy, ts: Math.round(now) });
            if (trail.current.length >= TRAIL_MAX_POINTS) {
                flushTrail();
                return;
            }
            if (flushTimer.current === null) {
                flushTimer.current = window.setTimeout(() => {
                    flushTimer.current = null;
                    flushTrail();
                }, CURSOR_FLUSH_MS);
            }
        },
        [flushTrail],
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
