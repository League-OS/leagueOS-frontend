import { card, outlineBtn } from './styles';
import type { CourtItem, Format, TournamentRecord } from './types';

type TournamentSidebarProps = {
  activeTournament: TournamentRecord | null;
  tournamentTimezone: string;
  formats: Format[];
  activeFormatId: string | null;
  courts: CourtItem[];
  requestShowAddFormat: () => void;
  openFormatConfig: (formatId: string) => void;
  closeTournament: () => void;
};

export function TournamentSidebar({
  activeTournament,
  tournamentTimezone,
  formats,
  activeFormatId,
  courts,
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
        <button style={outlineBtn} onClick={requestShowAddFormat}>+ Add Format</button>
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

      <hr style={{ border: 0, borderTop: '1px solid #e2e8f0', margin: '12px 0' }} />
      <strong>Tournament Courts</strong>
      <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
        {courts.map((court) => (
          <div key={court.id} style={{ border: '1px solid #dbe3ef', borderRadius: 999, padding: '6px 10px', fontSize: 13 }}>
            {court.name}
          </div>
        ))}
      </div>
      <p style={{ color: '#64748b', margin: '8px 0 0', fontSize: 12 }}>
        Manage courts and availability in the Courts tab.
      </p>
    </aside>
  );
}
