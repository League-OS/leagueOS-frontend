import { useEffect, useState } from 'react';

import { addIconBtn, card, field, subCard } from './styles';
import {
  formatTimezoneWithOffset,
  lifecycleStatusBadgeStyle,
  lifecycleStatusLabel,
  lifecycleStatusSelectStyle,
} from './lifecycleUi';
import type { Format, TournamentLifecycleStatus, TournamentRecord } from './types';

type FormatDirectoryPanelProps = {
  activeTournament: TournamentRecord | null;
  formats: Format[];
  activeFormatId: string | null;
  requestShowAddFormat: () => void;
  requestEditFormat: (formatId: string) => void;
  requestDeleteFormat: (formatId: string) => void;
  openFormatConfig: (formatId: string) => void;
  lifecycleStatusOptions: TournamentLifecycleStatus[];
  allowedLifecycleStatuses: (current: TournamentLifecycleStatus) => TournamentLifecycleStatus[];
  updateTournamentStatus: (tournamentId: string, status: TournamentLifecycleStatus) => void;
  tournamentSignupLink: string;
  requestEditTournament: (tournamentId: string) => void;
};

export function FormatDirectoryPanel({
  activeTournament,
  formats,
  activeFormatId,
  requestShowAddFormat,
  requestEditFormat,
  requestDeleteFormat,
  openFormatConfig,
  lifecycleStatusOptions,
  allowedLifecycleStatuses,
  updateTournamentStatus,
  tournamentSignupLink,
  requestEditTournament,
}: FormatDirectoryPanelProps) {
  const [copyStatus, setCopyStatus] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [qrStatus, setQrStatus] = useState<'idle' | 'loading' | 'error'>('idle');

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
  useEffect(() => {
    let cancelled = false;
    if (!tournamentSignupLink) {
      setQrDataUrl('');
      setQrStatus('idle');
      return;
    }
    setQrStatus('loading');
    void import('qrcode')
      .then((QRCode) => QRCode.toDataURL(tournamentSignupLink, {
        width: 280,
        margin: 1,
        errorCorrectionLevel: 'M',
        color: {
          dark: '#17302a',
          light: '#ffffff',
        },
      }))
      .then((nextDataUrl) => {
        if (cancelled) return;
        setQrDataUrl(nextDataUrl);
        setQrStatus('idle');
      })
      .catch(() => {
        if (cancelled) return;
        setQrDataUrl('');
        setQrStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [tournamentSignupLink]);

  function downloadQrPng() {
    if (!qrDataUrl) return;
    const safeName = (activeTournament?.name || 'tournament')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const link = document.createElement('a');
    link.href = qrDataUrl;
    link.download = `${safeName || 'tournament'}-signup-qr.png`;
    link.click();
  }

  return (
    <section style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2 style={{ margin: 0 }}>{activeTournament?.name || 'Tournament'}</h2>
            {activeTournament ? (
              <button
                style={iconBtn}
                title="Edit tournament"
                aria-label="Edit tournament"
                onClick={() => requestEditTournament(activeTournament.id)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M4 20h4l10-10-4-4L4 16v4Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="m12 6 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            ) : null}
          </div>
          <p style={{ margin: '4px 0 0', color: '#5b6a64' }}>
            {formatTimezoneWithOffset(activeTournament?.timezone || '')}
          </p>
        </div>
        <div style={{ display: 'grid', justifyItems: 'end', gap: 4 }}>
          <label style={{ fontSize: 12, color: '#30443d' }}>
            Status
          </label>
          <div style={{ minWidth: 240 }}>
            <select
              value={activeTournament?.status || 'DRAFT'}
              onChange={(event) => {
                if (!activeTournament) return;
                updateTournamentStatus(activeTournament.id, event.target.value as TournamentLifecycleStatus);
              }}
              style={{
                ...field,
                ...lifecycleStatusSelectStyle(activeTournament?.status || 'DRAFT'),
                minWidth: 240,
                minHeight: 32,
                padding: '4px 8px',
              }}
            >
              {lifecycleStatusOptions.map((status) => (
                <option
                  key={status}
                  value={status}
                  disabled={!activeTournament || !allowedLifecycleStatuses(activeTournament.status).includes(status)}
                >
                  {lifecycleStatusLabel[status]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <section style={{ ...subCard, marginTop: 10 }}>
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr auto', alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <strong style={{ fontSize: 13 }}>Tournament Signup</strong>
            <input value={tournamentSignupLink} readOnly style={{ ...field, background: '#f7faf8' }} />
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button
                style={iconBtn}
                title="Copy signup link"
                aria-label="Copy signup link"
                onClick={() => {
                  if (!tournamentSignupLink) return;
                  void navigator.clipboard.writeText(tournamentSignupLink)
                    .then(() => {
                      setCopyStatus('Copied');
                      window.setTimeout(() => setCopyStatus(''), 1200);
                    })
                    .catch(() => {
                      setCopyStatus('Copy failed');
                      window.setTimeout(() => setCopyStatus(''), 1200);
                    });
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="9" y="9" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
                  <rect x="5" y="5" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
                </svg>
              </button>
              <button
                style={{
                  ...iconBtn,
                  color: qrDataUrl ? '#17302a' : '#7d8a84',
                  background: qrDataUrl ? '#fff' : '#f1f5f3',
                  cursor: qrDataUrl ? 'pointer' : 'not-allowed',
                }}
                disabled={!qrDataUrl}
                title="Download QR as PNG"
                aria-label="Download QR as PNG"
                onClick={downloadQrPng}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 4v10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <path d="m8 10 4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M5 19h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
              {copyStatus ? <span style={{ color: '#5a6b64', fontSize: 12 }}>{copyStatus}</span> : null}
            </div>
          </div>
          <div style={{ border: '1px solid #d4dfd9', borderRadius: 10, padding: 6, background: '#fff' }}>
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="Tournament signup QR code" width={84} height={84} />
            ) : (
              <div style={{ width: 84, height: 84, display: 'grid', placeItems: 'center', color: '#6b7d75', fontSize: 11 }}>
                {qrStatus === 'loading' ? 'Generating...' : 'No QR'}
              </div>
            )}
          </div>
        </div>
      </section>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
        <strong>Formats</strong>
        <button style={addIconBtn} title="Add format" aria-label="Add format" onClick={requestShowAddFormat}>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16, lineHeight: 1.2 }}>{format.name}</div>
                  <div style={{ marginTop: 2, color: '#5a6b64', fontSize: 12 }}>
                    {format.type.replace('_', ' ')} · {format.config.schedulingModel || 'Model not set'}
                  </div>
                </div>
                <div style={{ display: 'grid', justifyItems: 'end', gap: 6 }}>
                  <span style={lifecycleStatusBadgeStyle(format.status)}>{lifecycleStatusLabel[format.status]}</span>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
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
