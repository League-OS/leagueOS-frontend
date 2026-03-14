import { addIconBtn, card, outlineBtn } from './styles';
import type { Format, TournamentRecord } from './types';

type TournamentSidebarProps = {
  activeTournament: TournamentRecord | null;
  tournamentTimezone: string;
  formats: Format[];
  activeFormatId: string | null;
  requestShowAddFormat: () => void;
  openFormatConfig: (formatId: string) => void;
  closeTournament: () => void;
};

export function TournamentSidebar({
  activeTournament,
  tournamentTimezone,
  formats,
  activeFormatId,
  requestShowAddFormat,
  openFormatConfig,
  closeTournament,
}: TournamentSidebarProps) {
  return (
    <aside style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ fontWeight: 800, fontSize: 18 }}>{activeTournament?.name || 'Untitled Tournament'}</div>
        <button style={outlineBtn} onClick={closeTournament}>Back</button>
      </div>
      <p style={{ color: '#64748b', marginTop: 6 }}>
        Status: {activeTournament?.status || 'Draft'} · {activeTournament?.seasonName || 'No season'} · {activeTournament?.timezone || tournamentTimezone}
      </p>
      <hr style={{ border: 0, borderTop: '1px solid #e2e8f0', margin: '10px 0' }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>Formats</strong>
        <button style={addIconBtn} title="Add format" aria-label="Add format" onClick={requestShowAddFormat}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
        {formats.map((format) => (
          <button
            key={format.id}
            type="button"
            onClick={() => openFormatConfig(format.id)}
            style={{
              border: '1px solid #dbe3ef',
              borderRadius: 10,
              padding: 10,
              background: activeFormatId === format.id ? '#f0fdfa' : '#fff',
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontWeight: 700 }}>{format.name}</div>
            <div style={{ marginTop: 6, color: '#64748b', fontSize: 13 }}>
              Scheduling Model: {format.config.schedulingModel || 'Not set'}
            </div>
          </button>
        ))}
      </div>

    </aside>
  );
}
