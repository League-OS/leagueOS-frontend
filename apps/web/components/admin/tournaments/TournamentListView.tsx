import { addIconBtn, card, field, labelCol, outlineBtn, saveEnabledStyle, td, textLinkBtn, th } from './styles';
import { formatTimezoneWithOffset, lifecycleStatusBadgeStyle, lifecycleStatusLabel } from './lifecycleUi';
import type { TournamentLifecycleStatus, TournamentRecord } from './types';

type TournamentListViewProps = {
  showCreateTournament: boolean;
  requestShowCreateTournament: () => void;
  requestEditTournament: (id: string) => void;
  cancelTournamentEditor: () => void;
  editingTournamentId: string | null;
  editingTournamentStatus: TournamentLifecycleStatus;
  tournamentFieldEditability: {
    canEditIdentity: boolean;
    canEditTimezone: boolean;
    canEditWindow: boolean;
    canEditNotes: boolean;
  };
  tournamentName: string;
  setTournamentName: (value: string) => void;
  tournamentTimezone: string;
  setTournamentTimezone: (value: string) => void;
  tournamentStartAt: string;
  setTournamentStartAt: (value: string) => void;
  tournamentEndAt: string;
  setTournamentEndAt: (value: string) => void;
  tournamentAdminNotes: string;
  setTournamentAdminNotes: (value: string) => void;
  timezoneOptions: string[];
  tournamentFormError: string;
  setTournamentFormError: (value: string) => void;
  saveTournament: () => void;
  tournaments: TournamentRecord[];
  openTournament: (id: string) => void;
  requestDeleteTournament: (id: string) => void;
};

export function TournamentListView({
  showCreateTournament,
  requestShowCreateTournament,
  requestEditTournament,
  cancelTournamentEditor,
  editingTournamentId,
  editingTournamentStatus,
  tournamentFieldEditability,
  tournamentName,
  setTournamentName,
  tournamentTimezone,
  setTournamentTimezone,
  tournamentStartAt,
  setTournamentStartAt,
  tournamentEndAt,
  setTournamentEndAt,
  tournamentAdminNotes,
  setTournamentAdminNotes,
  timezoneOptions,
  tournamentFormError,
  setTournamentFormError,
  saveTournament,
  tournaments,
  openTournament,
  requestDeleteTournament,
}: TournamentListViewProps) {
  const isEditMode = Boolean(editingTournamentId);
  const formTitle = isEditMode ? 'Edit Tournament' : 'Create Tournament';
  const submitLabel = isEditMode ? 'Save' : 'Create';
  function fmtDateTime(value: string): string {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '-';
    return parsed.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }
  const iconBtn = {
    width: 30,
    height: 30,
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

  if (showCreateTournament) {
    return (
      <section style={card}>
        <h2 style={{ marginTop: 0 }}>{formTitle}</h2>
        <div style={{ display: 'grid', gap: 10 }}>
          <label style={labelCol}>
            Tournament Name <span style={{ color: '#b91c1c' }}>*</span>
            <input
              value={tournamentName}
              onChange={(event) => {
                setTournamentName(event.target.value);
                if (event.target.value.trim()) setTournamentFormError('');
              }}
              placeholder="Tournament Name"
              style={{ ...field, background: isEditMode && !tournamentFieldEditability.canEditIdentity ? '#f3f6f4' : field.background }}
              disabled={isEditMode && !tournamentFieldEditability.canEditIdentity}
            />
          </label>
          <label style={labelCol}>
            Timezone
            <select
              value={tournamentTimezone}
              onChange={(event) => setTournamentTimezone(event.target.value)}
              style={{ ...field, background: isEditMode && !tournamentFieldEditability.canEditTimezone ? '#f3f6f4' : field.background }}
              disabled={isEditMode && !tournamentFieldEditability.canEditTimezone}
            >
              {timezoneOptions.map((zone) => (
                <option key={zone} value={zone}>{formatTimezoneWithOffset(zone)}</option>
              ))}
            </select>
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            <label style={labelCol}>
              Tournament Start
              <input
                type="datetime-local"
                value={tournamentStartAt}
                onChange={(event) => setTournamentStartAt(event.target.value)}
                style={{ ...field, background: isEditMode && !tournamentFieldEditability.canEditWindow ? '#f3f6f4' : field.background }}
                disabled={isEditMode && !tournamentFieldEditability.canEditWindow}
              />
            </label>
            <label style={labelCol}>
              Tournament End
              <input
                type="datetime-local"
                value={tournamentEndAt}
                onChange={(event) => setTournamentEndAt(event.target.value)}
                style={{ ...field, background: isEditMode && !tournamentFieldEditability.canEditWindow ? '#f3f6f4' : field.background }}
                disabled={isEditMode && !tournamentFieldEditability.canEditWindow}
              />
            </label>
          </div>
          <label style={labelCol}>
            Admin Notes
            <textarea
              value={tournamentAdminNotes}
              onChange={(event) => setTournamentAdminNotes(event.target.value)}
              placeholder="Internal setup notes"
              style={{
                ...field,
                minHeight: 90,
                resize: 'vertical',
                background: isEditMode && !tournamentFieldEditability.canEditNotes ? '#f3f6f4' : field.background,
              }}
              disabled={isEditMode && !tournamentFieldEditability.canEditNotes}
            />
          </label>
          {isEditMode && (
            <p style={{ margin: 0, color: '#5b6a64', fontSize: 12 }}>
              Current status: <strong>{lifecycleStatusLabel[editingTournamentStatus]}</strong>. Some fields are locked by lifecycle rules.
            </p>
          )}
          {tournamentFormError ? <div style={{ color: '#b91c1c', fontWeight: 600 }}>{tournamentFormError}</div> : null}
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
          <button style={outlineBtn} onClick={cancelTournamentEditor}>Cancel</button>
          <button
            style={saveEnabledStyle(Boolean(tournamentName.trim()))}
            disabled={!tournamentName.trim()}
            onClick={saveTournament}
          >
            {submitLabel}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h2 style={{ margin: 0 }}>Tournaments</h2>
        <button
          type="button"
          style={addIconBtn}
          onClick={requestShowCreateTournament}
          title="Create tournament"
          aria-label="Create tournament"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {!tournaments.length ? (
        <p style={{ color: '#64748b' }}>No tournaments created yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}>
          <thead>
            <tr>
              {['Tournament', 'Timezone', 'Start', 'End', 'Status', 'Formats', 'Actions'].map((header) => (
                <th key={header} style={th}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tournaments.map((item) => (
              <tr key={item.id}>
                <td style={td}>
                  <button
                    type="button"
                    style={textLinkBtn}
                    onClick={() => openTournament(item.id)}
                    title={`Open ${item.name}`}
                    aria-label={`Open ${item.name}`}
                  >
                    {item.name}
                  </button>
                </td>
                <td style={td}>{formatTimezoneWithOffset(item.timezone)}</td>
                <td style={td}>{fmtDateTime(item.startAt)}</td>
                <td style={td}>{fmtDateTime(item.endAt)}</td>
                <td style={td}>
                  <span style={lifecycleStatusBadgeStyle(item.status)}>{lifecycleStatusLabel[item.status]}</span>
                </td>
                <td style={td}>{item.formats.length || item.formatCount}</td>
                <td style={td}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      style={iconBtn}
                      onClick={() => requestEditTournament(item.id)}
                      title={`Edit ${item.name}`}
                      aria-label={`Edit ${item.name}`}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M4 20h4l10-10-4-4L4 16v4Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="m12 6 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      style={{ ...iconBtn, border: '1px solid #f3c1c1', color: '#b42318', background: '#fff6f6' }}
                      onClick={() => requestDeleteTournament(item.id)}
                      title={`Delete ${item.name}`}
                      aria-label={`Delete ${item.name}`}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M3 6h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        <path d="M8 6V4h8v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M6 6l1 14h10l1-14" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                        <path d="M10 10v7M14 10v7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
