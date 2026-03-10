export type LiveUpdateType = 'match_update' | 'tournament_update' | 'heartbeat' | 'resync_needed';

export type LiveUpdate = {
  version: 1;
  eventId: string;
  source: 'ws' | 'local' | 'broadcast';
  type: LiveUpdateType;
  tournamentId: number;
  matchId?: number;
  payload?: Record<string, unknown>;
  seq?: number;
  ts: number;
};

function eventId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createTournamentLiveChannel(args: {
  tournamentId: number;
  onMessage: (msg: LiveUpdate) => void;
  onResync?: (reason: 'reconnect' | 'stale' | 'resync_needed') => void | Promise<void>;
  wsUrl?: string;
}) {
  const wsBase = args.wsUrl ?? process.env.NEXT_PUBLIC_TOURNAMENT_WS_URL ?? '';
  let ws: WebSocket | null = null;
  let closed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempts = 0;
  let seq = 0;
  let lastEventTs = 0;
  const seenEventIds = new Set<string>();

  const broadcastKey = `leagueos.tournament.live.${args.tournamentId}`;
  const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(broadcastKey) : null;

  const markSeen = (msg: LiveUpdate) => {
    seenEventIds.add(msg.eventId);
    if (seenEventIds.size > 500) {
      const first = seenEventIds.values().next().value;
      if (first) seenEventIds.delete(first);
    }
  };

  const deliver = (msg: LiveUpdate, rebroadcast = false) => {
    if (msg.tournamentId !== args.tournamentId) return;
    if (seenEventIds.has(msg.eventId)) return;
    if (msg.ts < lastEventTs - 10_000) {
      void args.onResync?.('stale');
      return;
    }

    markSeen(msg);
    lastEventTs = Math.max(lastEventTs, msg.ts);
    args.onMessage(msg);

    if (rebroadcast) {
      try {
        bc?.postMessage(msg);
      } catch {
        // ignore
      }
    }
  };

  bc?.addEventListener('message', (ev) => {
    if (!ev?.data) return;
    const msg = ev.data as LiveUpdate;
    deliver({ ...msg, source: 'broadcast' }, false);
  });

  const connect = () => {
    if (!wsBase || closed) return;
    const url = `${wsBase.replace(/\/$/, '')}/tournaments/${args.tournamentId}`;
    ws = new WebSocket(url);

    ws.onopen = () => {
      reconnectAttempts = 0;
      void args.onResync?.('reconnect');
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data as string) as Partial<LiveUpdate>;
        const normalized: LiveUpdate = {
          version: 1,
          eventId: data.eventId || eventId(),
          source: 'ws',
          type: (data.type as LiveUpdateType) || 'match_update',
          tournamentId: data.tournamentId ?? args.tournamentId,
          matchId: data.matchId,
          payload: data.payload,
          seq: data.seq,
          ts: data.ts ?? Date.now(),
        };

        if (normalized.type === 'resync_needed') {
          void args.onResync?.('resync_needed');
          return;
        }

        deliver(normalized, true);
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      if (closed) return;
      reconnectAttempts += 1;
      const backoff = Math.min(10_000, 800 * Math.max(1, reconnectAttempts));
      reconnectTimer = setTimeout(connect, backoff);
    };

    ws.onerror = () => {
      ws?.close();
    };
  };

  connect();

  return {
    publishLocal(update: Omit<LiveUpdate, 'ts' | 'tournamentId' | 'eventId' | 'version' | 'source' | 'seq'>) {
      seq += 1;
      const msg: LiveUpdate = {
        version: 1,
        eventId: eventId(),
        source: 'local',
        type: update.type,
        tournamentId: args.tournamentId,
        matchId: update.matchId,
        payload: update.payload,
        seq,
        ts: Date.now(),
      };
      deliver(msg, true);
    },
    close() {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
      bc?.close();
    },
  };
}
