import { card, outlineBtn, subCard } from './styles';
import type { Format, TournamentRecord } from './types';

type FormatDirectoryPanelProps = {
  activeTournament: TournamentRecord | null;
  formats: Format[];
  activeFormatId: string | null;
  closeTournament: () => void;
  requestShowAddFormat: () => void;
  requestEditFormat: (formatId: string) => void;
  openFormatConfig: (formatId: string) => void;
};

export function FormatDirectoryPanel({
  activeTournament,
  formats,
  activeFormatId,
  closeTournament,
  requestShowAddFormat,
  requestEditFormat,
  openFormatConfig,
}: FormatDirectoryPanelProps) {
  return (
    <section style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div>
          <h2 style={{ margin: 0 }}>{activeTournament?.name || 'Tournament'}</h2>
          <p style={{ margin: '4px 0 0', color: '#5b6a64' }}>
            Status: {activeTournament?.status || 'Draft'} · {activeTournament?.seasonName || 'No season'} · {activeTournament?.timezone || '-'}
          </p>
        </div>
        <button style={outlineBtn} onClick={closeTournament}>Back</button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
        <strong>Formats</strong>
        <button style={outlineBtn} onClick={requestShowAddFormat}>+ Add Format</button>
      </div>

      <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
        {formats.length ? (
          formats.map((format) => (
            <article
              key={format.id}
              role="button"
              tabIndex={0}
              onClick={() => openFormatConfig(format.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  openFormatConfig(format.id);
                }
              }}
              style={{
                ...subCard,
                borderColor: activeFormatId === format.id ? '#8ecfb3' : '#d6e2db',
                background: activeFormatId === format.id ? '#eef9f3' : '#f9fcfa',
                padding: 10,
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 800 }}>{format.name}</div>
                  <div style={{ marginTop: 4, color: '#5a6b64', fontSize: 13 }}>
                    {format.type.replace('_', ' ')} · {format.config.schedulingModel || 'Model not set'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    style={outlineBtn}
                    onClick={(event) => {
                      event.stopPropagation();
                      requestEditFormat(format.id);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    style={outlineBtn}
                    onClick={(event) => {
                      event.stopPropagation();
                      openFormatConfig(format.id);
                    }}
                  >
                    Open
                  </button>
                </div>
              </div>
            </article>
          ))
        ) : (
          <p style={{ margin: 0, color: '#5a6b64' }}>No formats yet. Add a format to start configuration.</p>
        )}
      </div>
    </section>
  );
}
