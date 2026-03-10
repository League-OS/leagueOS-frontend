import { EditModeHeader, SaveRow } from './shared';
import { field, grid3, labelCol, outlineBtn, subCard, td, th } from './styles';
import type { CourtConfig, CourtItem, SlotDraft } from './types';

type CourtsTabProps = {
  courtsEditMode: boolean;
  setCourtsEditMode: (value: boolean | ((prev: boolean) => boolean)) => void;
  courts: CourtItem[];
  setShowAddCourtModal: (value: boolean) => void;
  activeCourtId: string | null;
  setActiveCourtId: (value: string) => void;
  courtConfigDraft: CourtConfig | null;
  slotDraft: SlotDraft;
  setSlotDraft: (value: SlotDraft | ((prev: SlotDraft) => SlotDraft)) => void;
  addCourtAvailabilitySlot: () => void;
  removeCourtAvailabilitySlot: (slotId: string) => void;
  courtDirty: boolean;
  saveCourtsConfig: () => void;
};

export function CourtsTab({
  courtsEditMode,
  setCourtsEditMode,
  courts,
  setShowAddCourtModal,
  activeCourtId,
  setActiveCourtId,
  courtConfigDraft,
  slotDraft,
  setSlotDraft,
  addCourtAvailabilitySlot,
  removeCourtAvailabilitySlot,
  courtDirty,
  saveCourtsConfig,
}: CourtsTabProps) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <EditModeHeader enabled={courtsEditMode} label="Courts" onToggle={() => setCourtsEditMode((prev) => !prev)} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>Tournament Courts</strong>
        <button style={outlineBtn} disabled={!courtsEditMode} onClick={() => setShowAddCourtModal(true)}>+ Add Court</button>
      </div>

      {!courts.length ? (
        <section style={subCard}>
          <p style={{ margin: 0, color: '#64748b' }}>No courts added yet. Add at least one court to configure availability.</p>
        </section>
      ) : (
        <section style={subCard}>
          <div style={{ display: 'grid', gap: 8 }}>
            {courts.map((court) => (
              <button
                key={court.id}
                type="button"
                onClick={() => setActiveCourtId(court.id)}
                style={{
                  ...outlineBtn,
                  textAlign: 'left',
                  borderColor: activeCourtId === court.id ? '#0d9488' : '#cbd5e1',
                  background: activeCourtId === court.id ? '#ecfeff' : '#fff',
                }}
              >
                {court.name}
              </button>
            ))}
          </div>
        </section>
      )}

      <section style={subCard}>
        <strong>Court Availability</strong>
        {!activeCourtId ? (
          <p style={{ color: '#64748b' }}>Select a court to configure availability.</p>
        ) : (
          <>
            <p style={{ margin: '6px 0 10px', color: '#64748b' }}>
              Add one or more date/time slots. If no slots are added for this court, scheduling uses the global window from Schedules.
            </p>
            <div style={{ ...grid3, marginBottom: 10 }}>
              <label style={labelCol}>
                Date
                <input
                  type="date"
                  value={slotDraft.date}
                  onChange={(event) => setSlotDraft((prev) => ({ ...prev, date: event.target.value }))}
                  style={field}
                  disabled={!courtsEditMode}
                />
              </label>
              <label style={labelCol}>
                Start Time
                <input
                  type="time"
                  value={slotDraft.startTime}
                  onChange={(event) => setSlotDraft((prev) => ({ ...prev, startTime: event.target.value }))}
                  style={field}
                  disabled={!courtsEditMode}
                />
              </label>
              <label style={labelCol}>
                End Time
                <input
                  type="time"
                  value={slotDraft.endTime}
                  onChange={(event) => setSlotDraft((prev) => ({ ...prev, endTime: event.target.value }))}
                  style={field}
                  disabled={!courtsEditMode}
                />
              </label>
            </div>
            <button style={outlineBtn} onClick={addCourtAvailabilitySlot} disabled={!courtsEditMode}>Add Availability Slot</button>

            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}>
              <thead>
                <tr>
                  {['Date', 'Start', 'End', 'Actions'].map((header) => (
                    <th key={header} style={th}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(courtConfigDraft?.availability[activeCourtId] || []).length ? (
                  (courtConfigDraft?.availability[activeCourtId] || []).map((slot) => (
                    <tr key={slot.id}>
                      <td style={td}>{slot.date}</td>
                      <td style={td}>{slot.startTime}</td>
                      <td style={td}>{slot.endTime}</td>
                      <td style={td}>
                        <button style={outlineBtn} onClick={() => removeCourtAvailabilitySlot(slot.id)} disabled={!courtsEditMode}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td style={td} colSpan={4}>No slots defined. This court uses global schedule start/end by default.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </>
        )}
      </section>

      <SaveRow enabled={courtsEditMode && courtDirty} onSave={saveCourtsConfig} />
    </div>
  );
}
