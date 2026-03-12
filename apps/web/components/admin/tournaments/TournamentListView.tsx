import { card, field, labelCol, outlineBtn, primaryBtn, saveEnabledStyle, td, th } from './styles';
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
}: TournamentListViewProps) {
  const isEditMode = Boolean(editingTournamentId);
  const formTitle = isEditMode ? 'Edit Tournament' : 'Create Tournament';
  const submitLabel = isEditMode ? 'Save' : 'Create';

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Tournaments</h2>
        <button style={primaryBtn} onClick={requestShowCreateTournament}>Create New Tournament</button>
      </div>
      {!tournaments.length ? (
        <p style={{ color: '#64748b' }}>No tournaments created yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}>
          <thead>
            <tr>
              {['Tournament', 'Timezone', 'Status', 'Formats', 'Actions'].map((header) => (
                <th key={header} style={th}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tournaments.map((item) => (
              <tr key={item.id}>
                <td style={td}>{item.name}</td>
                <td style={td}>{formatTimezoneWithOffset(item.timezone)}</td>
                <td style={td}>
                  <span style={lifecycleStatusBadgeStyle(item.status)}>{lifecycleStatusLabel[item.status]}</span>
                </td>
                <td style={td}>{item.formats.length}</td>
                <td style={td}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button style={outlineBtn} onClick={() => openTournament(item.id)}>Open</button>
                    <button style={outlineBtn} onClick={() => requestEditTournament(item.id)}>Edit</button>
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
