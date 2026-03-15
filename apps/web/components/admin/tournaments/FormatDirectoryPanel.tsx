import { useEffect, useState } from 'react';

import { addIconBtn, card, field, subCard } from './styles';
import {
  formatTimezoneWithOffset,
  lifecycleStatusBadgeStyle,
  lifecycleStatusLabel,
  lifecycleStatusSelectStyle,
} from './lifecycleUi';
import type { Format, TournamentLifecycleStatus, TournamentRecord } from './types';

export type TournamentShareLink = {
  id: string;
  label: string;
  url: string;
  description: string;
  qrFileSuffix: string;
  authRequired?: boolean;
  showQr?: boolean;
};

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
  shareLinks: TournamentShareLink[];
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
  shareLinks,
  requestEditTournament,
}: FormatDirectoryPanelProps) {
  const [copyStatus, setCopyStatus] = useState('');
  const [shareLinksExpanded, setShareLinksExpanded] = useState(true);
  const [qrDataUrls, setQrDataUrls] = useState<Record<string, string>>({});
  const [qrStatuses, setQrStatuses] = useState<Record<string, 'idle' | 'loading' | 'error'>>({});

  const activeShareLinks = shareLinks.filter((link) => link.url);
  const qrEnabledLinks = activeShareLinks.filter((link) => link.showQr !== false);
  const shareLinkFingerprint = qrEnabledLinks.map((link) => `${link.id}:${link.url}`).join('|');

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
    if (!activeFormatId) return;
    setShareLinksExpanded(false);
  }, [activeFormatId]);

  useEffect(() => {
    let cancelled = false;
    if (!qrEnabledLinks.length) {
      setQrDataUrls({});
      setQrStatuses({});
      return;
    }
    setQrStatuses(
      qrEnabledLinks.reduce<Record<string, 'idle' | 'loading' | 'error'>>((acc, link) => {
        acc[link.id] = 'loading';
        return acc;
      }, {}),
    );
    void import('qrcode')
      .then(async (QRCode) => Promise.all(
        qrEnabledLinks.map(async (link) => ({
          id: link.id,
          dataUrl: await QRCode.toDataURL(link.url, {
            width: 280,
            margin: 1,
            errorCorrectionLevel: 'M',
            color: {
              dark: '#17302a',
              light: '#ffffff',
            },
          }),
        })),
      ))
      .then((entries) => {
        if (cancelled) return;
        setQrDataUrls(
          entries.reduce<Record<string, string>>((acc, entry) => {
            acc[entry.id] = entry.dataUrl;
            return acc;
          }, {}),
        );
        setQrStatuses(
          entries.reduce<Record<string, 'idle' | 'loading' | 'error'>>((acc, entry) => {
            acc[entry.id] = 'idle';
            return acc;
          }, {}),
        );
      })
      .catch(() => {
        if (cancelled) return;
        setQrDataUrls({});
        setQrStatuses(
          qrEnabledLinks.reduce<Record<string, 'idle' | 'loading' | 'error'>>((acc, link) => {
            acc[link.id] = 'error';
            return acc;
          }, {}),
        );
      });

    return () => {
      cancelled = true;
    };
  }, [qrEnabledLinks.length, shareLinkFingerprint]);

  function downloadQrPng(linkId: string, qrFileSuffix: string) {
    const qrDataUrl = qrDataUrls[linkId];
    if (!qrDataUrl) return;
    const safeName = (activeTournament?.name || 'tournament')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const link = document.createElement('a');
    link.href = qrDataUrl;
    link.download = `${safeName || 'tournament'}-${qrFileSuffix}-qr.png`;
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

      <section style={{ ...subCard, marginTop: 10, padding: 0, overflow: 'hidden' }}>
        <button
          type="button"
          onClick={() => setShareLinksExpanded((value) => !value)}
          style={{
            width: '100%',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            padding: '12px 14px',
            border: 0,
            borderBottom: shareLinksExpanded ? '1px solid #d7e4dd' : '0',
            background: '#f9fcfa',
            cursor: 'pointer',
            color: '#17302a',
          }}
        >
          <span style={{ display: 'grid', gap: 2, textAlign: 'left' }}>
            <strong style={{ fontSize: 13 }}>Share URLs</strong>
            <span style={{ color: '#5a6b64', fontSize: 12 }}>
              {activeShareLinks.length} active now. This list is ready for more tournament-facing views.
            </span>
          </span>
          <span style={{ color: '#4a5c54', fontSize: 12, fontWeight: 700 }}>
            {shareLinksExpanded ? 'Collapse' : 'Expand'}
          </span>
        </button>

        {shareLinksExpanded ? (
          <div
            style={{
              display: 'grid',
              gap: 10,
              padding: 12,
              gridTemplateColumns: 'repeat(auto-fit, minmax(430px, 1fr))',
            }}
          >
            {activeShareLinks.map((shareLink) => {
              const showQr = shareLink.showQr !== false;
              const qrDataUrl = qrDataUrls[shareLink.id] || '';
              const qrStatus = showQr ? (qrStatuses[shareLink.id] || 'idle') : 'idle';
              return (
                <article
                  key={shareLink.id}
                  style={{
                    border: '1px solid #d7e4dd',
                    borderRadius: 12,
                    background: '#fff',
                    padding: 10,
                    display: 'grid',
                    gap: 8,
                    gridTemplateColumns: showQr ? 'minmax(0, 1fr) auto' : 'minmax(0, 1fr)',
                    alignItems: 'start',
                  }}
                >
                  <div style={{ display: 'grid', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: 13 }}>{shareLink.label}</strong>
                      {shareLink.authRequired ? (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: '#6a4b04',
                            background: '#fff4ce',
                            border: '1px solid #f1d58d',
                            borderRadius: 999,
                            padding: '3px 8px',
                          }}
                        >
                          Admin auth required
                        </span>
                      ) : null}
                    </div>
                    <input value={shareLink.url} readOnly style={{ ...field, background: '#f7faf8' }} />
                    <span style={{ color: '#5a6b64', fontSize: 12 }}>{shareLink.description}</span>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <button
                        style={iconBtn}
                        title={`Copy ${shareLink.label}`}
                        aria-label={`Copy ${shareLink.label}`}
                        onClick={() => {
                          if (!shareLink.url) return;
                          void navigator.clipboard.writeText(shareLink.url)
                            .then(() => {
                              setCopyStatus(`${shareLink.label} copied`);
                              window.setTimeout(() => setCopyStatus(''), 1400);
                            })
                            .catch(() => {
                              setCopyStatus('Copy failed');
                              window.setTimeout(() => setCopyStatus(''), 1400);
                            });
                        }}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <rect x="9" y="9" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
                          <rect x="5" y="5" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
                        </svg>
                      </button>
                      {showQr ? (
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
                          onClick={() => downloadQrPng(shareLink.id, shareLink.qrFileSuffix)}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M12 4v10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                            <path d="m8 10 4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M5 19h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                          </svg>
                        </button>
                      ) : null}
                      {copyStatus ? <span style={{ color: '#5a6b64', fontSize: 12 }}>{copyStatus}</span> : null}
                    </div>
                  </div>
                  {showQr ? (
                    <div style={{ border: '1px solid #d4dfd9', borderRadius: 10, padding: 6, background: '#fff' }}>
                      {qrDataUrl ? (
                        <img src={qrDataUrl} alt={`${shareLink.label} QR code`} width={84} height={84} />
                      ) : (
                        <div style={{ width: 84, height: 84, display: 'grid', placeItems: 'center', color: '#6b7d75', fontSize: 11 }}>
                          {qrStatus === 'loading' ? 'Generating...' : 'No QR'}
                        </div>
                      )}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : null}
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
