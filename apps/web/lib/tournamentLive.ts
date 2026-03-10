export type LiveUpdate = {
  type: 'match_update' | 'tournament_update';
  tournamentId: number;
  matchId?: number;
  payload?: Record<string, unknown>;
  ts: number;
};

export function createTournamentLiveChannel(args: {
  tournamentId: number;
  onMessage: (msg: LiveUpdate) => void;
  wsUrl?: string;
}) {
  const wsBase = args.wsUrl ?? process.env.NEXT_PUBLIC_TOURNAMENT_WS_URL ?? '';
  let ws: WebSocket | null = null;
  let closed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const broadcastKey = `leagueos.tournament.live.${args.tournamentId}`;
  const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(broadcastKey) : null;

  const emit = (msg: LiveUpdate) => {
    args.onMessage(msg);
    try {
      bc?.postMessage(msg);
    } catch {
      // ignore
    }
  };

  bc?.addEventListener('message', (ev) => {
    if (!ev?.data) return;
    args.onMessage(ev.data as LiveUpdate);
  });

  const connect = () => {
    if (!wsBase || closed) return;
    const url = `${wsBase.replace(/\/$/, '')}/tournaments/${args.tournamentId}`;
    ws = new WebSocket(url);

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data as string) as LiveUpdate;
        emit(data);
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      if (closed) return;
      reconnectTimer = setTimeout(connect, 1500);
    };

    ws.onerror = () => {
      ws?.close();
    };
  };

  connect();

  return {
    publishLocal(update: Omit<LiveUpdate, 'ts' | 'tournamentId'>) {
      emit({ ...update, tournamentId: args.tournamentId, ts: Date.now() });
    },
    close() {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
      bc?.close();
    },
  };
}
