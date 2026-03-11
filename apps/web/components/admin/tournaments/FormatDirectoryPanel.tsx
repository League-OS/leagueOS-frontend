import { card, subCard } from './styles';
import type { Format, TournamentRecord } from './types';

type FormatDirectoryPanelProps = {
  activeTournament: TournamentRecord | null;
  formats: Format[];
  activeFormatId: string | null;
  closeTournament: () => void;
  requestShowAddFormat: () => void;
  requestEditFormat: (formatId: string) => void;
  requestDeleteFormat: (formatId: string) => void;
  openFormatConfig: (formatId: string) => void;
};

export function FormatDirectoryPanel({
  activeTournament,
  formats,
  activeFormatId,
  closeTournament,
  requestShowAddFormat,
  requestEditFormat,
  requestDeleteFormat,
  openFormatConfig,
}: FormatDirectoryPanelProps) {
  const iconBtn = {
    width: 28,
    height: 28,
    border: '1px solid #c3d2ca',
    borderRadius: 8,
    background: '#fff',
    color: '#17302a',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    cursor: 'pointer',
  } as const;

  return (
    <section style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div>
          <h2 style={{ margin: 0 }}>{activeTournament?.name || 'Tournament'}</h2>
          <p style={{ margin: '4px 0 0', color: '#5b6a64' }}>
            Status: {activeTournament?.status || 'Draft'} · {activeTournament?.seasonName || 'No season'} · {activeTournament?.timezone || '-'}
          </p>
        </div>
        <button style={iconBtn} title="Back" aria-label="Back" onClick={closeTournament}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="m15 18-6-6 6-6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
        <strong>Formats</strong>
        <button style={iconBtn} title="Add format" aria-label="Add format" onClick={requestShowAddFormat}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div style={{ display: 'grid', gap: 6, marginTop: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
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
                padding: 7,
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16, lineHeight: 1.2 }}>{format.name}</div>
                  <div style={{ marginTop: 2, color: '#5a6b64', fontSize: 12 }}>
                    {format.type.replace('_', ' ')} · {format.config.schedulingModel || 'Model not set'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    style={iconBtn}
                    title="Edit format"
                    aria-label={`Edit ${format.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      requestEditFormat(format.id);
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M4 20h4l10-10-4-4L4 16v4Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="m12 6 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </button>
                  <button
                    style={{ ...iconBtn, border: '1px solid #f3c1c1', color: '#b42318', background: '#fff6f6' }}
                    title="Delete format"
                    aria-label={`Delete ${format.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      requestDeleteFormat(format.id);
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M3 6h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      <path d="M8 6V4h8v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M6 6l1 14h10l1-14" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                      <path d="M10 10v7M14 10v7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
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
