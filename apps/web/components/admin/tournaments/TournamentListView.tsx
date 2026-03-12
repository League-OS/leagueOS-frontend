import { card, field, labelCol, outlineBtn, primaryBtn, saveEnabledStyle, td, th } from './styles';
import { formatTimezoneWithOffset, lifecycleStatusBadgeStyle, lifecycleStatusLabel } from './lifecycleUi';
import type { TournamentRecord } from './types';

type TournamentListViewProps = {
  showCreateTournament: boolean;
  setShowCreateTournament: (value: boolean) => void;
  tournamentName: string;
  setTournamentName: (value: string) => void;
  tournamentTimezone: string;
  setTournamentTimezone: (value: string) => void;
  tournamentAdminNotes: string;
  setTournamentAdminNotes: (value: string) => void;
  timezoneOptions: string[];
  tournamentFormError: string;
  setTournamentFormError: (value: string) => void;
  createTournament: () => void;
  tournaments: TournamentRecord[];
  openTournament: (id: string) => void;
};

export function TournamentListView({
  showCreateTournament,
  setShowCreateTournament,
  tournamentName,
  setTournamentName,
  tournamentTimezone,
  setTournamentTimezone,
  tournamentAdminNotes,
  setTournamentAdminNotes,
  timezoneOptions,
  tournamentFormError,
  setTournamentFormError,
  createTournament,
  tournaments,
  openTournament,
}: TournamentListViewProps) {
  if (showCreateTournament) {
    return (
      <section style={card}>
        <h2 style={{ marginTop: 0 }}>Create Tournament</h2>
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
              style={field}
            />
          </label>
          <label style={labelCol}>
            Timezone
            <select value={tournamentTimezone} onChange={(event) => setTournamentTimezone(event.target.value)} style={field}>
              {timezoneOptions.map((zone) => (
                <option key={zone} value={zone}>{formatTimezoneWithOffset(zone)}</option>
              ))}
            </select>
          </label>
          <label style={labelCol}>
            Admin Notes
            <textarea
              value={tournamentAdminNotes}
              onChange={(event) => setTournamentAdminNotes(event.target.value)}
              placeholder="Internal setup notes"
              style={{ ...field, minHeight: 90, resize: 'vertical' }}
            />
          </label>
          {tournamentFormError ? <div style={{ color: '#b91c1c', fontWeight: 600 }}>{tournamentFormError}</div> : null}
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
          <button style={outlineBtn} onClick={() => setShowCreateTournament(false)}>Cancel</button>
          <button
            style={saveEnabledStyle(Boolean(tournamentName.trim()))}
            disabled={!tournamentName.trim()}
            onClick={createTournament}
          >
            Create
          </button>
        </div>
      </section>
    );
  }

  return (
    <section style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Tournaments</h2>
        <button style={primaryBtn} onClick={() => setShowCreateTournament(true)}>Create New Tournament</button>
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
                  <button style={outlineBtn} onClick={() => openTournament(item.id)}>Open</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
