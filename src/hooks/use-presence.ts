import { useCallback, useEffect, useRef, useState } from "react";
import mqtt from "mqtt";
import type { Identity } from "@/lib/identity";

/**
 * Real-time presence over MQTT-over-WebSockets, using a public broker so the
 * demo needs no backend or API keys. Everyone on the same room topic sees each
 * other's cursors live. Messages are unauthenticated and public — demo data only.
 */
const BROKER_URL = "wss://broker.emqx.io:8084/mqtt";

const room = new URLSearchParams(window.location.search).get("room") ?? "main";
const TOPIC = `inline-xbrl-demo/${room}/v1`;

const HEARTBEAT_MS = 4000;
const PEER_TIMEOUT_MS = 12000;
const CURSOR_THROTTLE_MS = 90;

export interface PeerCursor {
    stmtId: string;
    doc: string;
    rowId: string;
    col: number;
    /** Fractional position inside the cell, so layout differences don't matter. */
    fx: number;
    fy: number;
}

export interface Peer {
    id: string;
    name: string;
    color: string;
    isAccount: boolean;
    cursor: PeerCursor | null;
    lastSeen: number;
}

type WireMessage =
    | { t: "hello"; id: string; name: string; color: string; acct: boolean }
    | { t: "bye"; id: string }
    | ({ t: "cur"; id: string; name: string; color: string; acct: boolean } & PeerCursor)
    | { t: "edit"; id: string; doc: string; stmtId: string; rowId: string; col: number; value: number | null };

export interface RemoteEdit {
    doc: string;
    stmtId: string;
    rowId: string;
    col: number;
    value: number | null;
}

export const usePresence = (identity: Identity, onRemoteEdit: (edit: RemoteEdit) => void) => {
    const [peers, setPeers] = useState<Record<string, Peer>>({});
    const [connected, setConnected] = useState(false);
    const clientRef = useRef<mqtt.MqttClient | null>(null);
    const identityRef = useRef(identity);
    identityRef.current = identity;
    const onRemoteEditRef = useRef(onRemoteEdit);
    onRemoteEditRef.current = onRemoteEdit;
    const lastCursorSent = useRef(0);

    const publish = useCallback((msg: WireMessage) => {
        const client = clientRef.current;
        if (client?.connected) client.publish(TOPIC, JSON.stringify(msg));
    }, []);

    const hello = useCallback(() => {
        const me = identityRef.current;
        publish({ t: "hello", id: me.id, name: me.name, color: me.color, acct: me.isAccount });
    }, [publish]);

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
                setPeers((prev) => {
                    const next = { ...prev };
                    delete next[msg.id];
                    return next;
                });
                return;
            }
            if (msg.t === "edit") {
                onRemoteEditRef.current({ doc: msg.doc, stmtId: msg.stmtId, rowId: msg.rowId, col: msg.col, value: msg.value });
                return;
            }

            setPeers((prev) => {
                const existing = prev[msg.id];
                // Announce ourselves to newcomers so they get the roster instantly.
                if (!existing) hello();
                return {
                    ...prev,
                    [msg.id]: {
                        id: msg.id,
                        name: msg.name,
                        color: msg.color,
                        isAccount: msg.acct,
                        cursor: msg.t === "cur" ? { stmtId: msg.stmtId, doc: msg.doc, rowId: msg.rowId, col: msg.col, fx: msg.fx, fy: msg.fy } : (existing?.cursor ?? null),
                        lastSeen: Date.now(),
                    },
                };
            });
        });

        const heartbeat = window.setInterval(hello, HEARTBEAT_MS);
        const reaper = window.setInterval(() => {
            setPeers((prev) => {
                const now = Date.now();
                const alive = Object.entries(prev).filter(([, p]) => now - p.lastSeen < PEER_TIMEOUT_MS);
                return alive.length === Object.keys(prev).length ? prev : Object.fromEntries(alive);
            });
        }, 3000);

        const bye = () => publish({ t: "bye", id: identityRef.current.id });
        window.addEventListener("beforeunload", bye);

        return () => {
            window.clearInterval(heartbeat);
            window.clearInterval(reaper);
            window.removeEventListener("beforeunload", bye);
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
            const now = Date.now();
            if (now - lastCursorSent.current < CURSOR_THROTTLE_MS) return;
            lastCursorSent.current = now;
            const me = identityRef.current;
            publish({ t: "cur", id: me.id, name: me.name, color: me.color, acct: me.isAccount, ...cursor });
        },
        [publish],
    );

    const sendEdit = useCallback(
        (edit: RemoteEdit) => publish({ t: "edit", id: identityRef.current.id, ...edit }),
        [publish],
    );

    return { peers, connected, sendCursor, sendEdit, room };
};
