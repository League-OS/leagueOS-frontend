import { useState } from 'react';

import { SaveRow } from './shared';
import { addIconBtn, field, grid3, labelCol, outlineBtn, subCard, td, th } from './styles';
import type { CourtConfig, CourtItem, SlotDraft } from './types';

type CourtsTabProps = {
  courts: CourtItem[];
  setShowAddCourtModal: (value: boolean) => void;
  renameCourt: (courtId: string, nextName: string) => void;
  deleteCourt: (courtId: string) => void;
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
  courts,
  setShowAddCourtModal,
  renameCourt,
  deleteCourt,
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
  const [showAvailabilityForm, setShowAvailabilityForm] = useState(false);
  const actionIconBtnBase = {
    width: 32,
    height: 32,
    borderRadius: 8,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    cursor: 'pointer',
    background: '#fff',
  } as const;

  function formatDuration(startTime: string, endTime: string): string {
    const parseMinutes = (value: string): number | null => {
      const match = /^(\d{1,2}):(\d{2})$/.exec(value);
      if (!match) return null;
      const hh = Number(match[1]);
      const mm = Number(match[2]);
      if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
      return hh * 60 + mm;
    };
    const start = parseMinutes(startTime);
    const end = parseMinutes(endTime);
    if (start === null || end === null) return '--:--';
    let diff = end - start;
    if (diff < 0) diff += 24 * 60;
    const hours = String(Math.floor(diff / 60)).padStart(2, '0');
    const mins = String(diff % 60).padStart(2, '0');
    return `${hours}:${mins}`;
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <strong>Tournament Courts</strong>
        <button style={addIconBtn} title="Add court" aria-label="Add court" onClick={() => setShowAddCourtModal(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {!courts.length ? (
        <section style={subCard}>
          <p style={{ margin: 0, color: '#64748b' }}>No courts added yet. Add at least one court to configure availability.</p>
        </section>
      ) : (
        <section style={subCard}>
          <div style={{ display: 'grid', gap: 8 }}>
            {courts.map((court) => (
              <div
                key={court.id}
                role="button"
                tabIndex={0}
                onClick={() => setActiveCourtId(court.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setActiveCourtId(court.id);
                  }
                }}
                style={{
                  border: activeCourtId === court.id ? '1px solid #8ad1c2' : '1px solid #d4ddd8',
                  background: activeCourtId === court.id ? '#f2fbf8' : '#fff',
                  borderRadius: 10,
                  padding: '8px 10px',
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                  <span
                    aria-hidden="true"
                    style={{
                      width: 4,
                      alignSelf: 'stretch',
                      borderRadius: 999,
                      background: activeCourtId === court.id ? '#0d9488' : '#dde6e0',
                    }}
                  />
                  <span style={{ fontWeight: activeCourtId === court.id ? 800 : 700, color: '#1c2f29' }}>
                    {court.name}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    aria-label={`Rename ${court.name}`}
                    title="Rename court"
                    style={{
                      ...actionIconBtnBase,
                      border: '1px solid #c4d2cb',
                      color: '#154b3f',
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      const nextName = window.prompt('Rename court', court.name);
                      if (nextName === null) return;
                      renameCourt(court.id, nextName);
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M4 20h4l10-10-4-4L4 16v4Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="m12 6 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${court.name}`}
                    title="Delete court"
                    style={{
                      ...actionIconBtnBase,
                      border: '1px solid #f3c1c1',
                      color: '#b42318',
                      background: '#fff6f6',
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      deleteCourt(court.id);
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
            {!showAvailabilityForm ? (
              <button style={outlineBtn} onClick={() => setShowAvailabilityForm(true)}>Add Availability Slot</button>
            ) : (
              <>
                <div style={{ ...grid3, marginBottom: 10 }}>
                  <label style={labelCol}>
                    Date
                    <input
                      type="date"
                      value={slotDraft.date}
                      onChange={(event) => setSlotDraft((prev) => ({ ...prev, date: event.target.value }))}
                      style={field}
                    />
                  </label>
                  <label style={labelCol}>
                    Start Time
                    <input
                      type="time"
                      value={slotDraft.startTime}
                      onChange={(event) => setSlotDraft((prev) => ({ ...prev, startTime: event.target.value }))}
                      style={field}
                    />
                  </label>
                  <label style={labelCol}>
                    End Time
                    <input
                      type="time"
                      value={slotDraft.endTime}
                      onChange={(event) => setSlotDraft((prev) => ({ ...prev, endTime: event.target.value }))}
                      style={field}
                    />
                  </label>
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <button
                    style={outlineBtn}
                    onClick={() => {
                      if (!slotDraft.date || !slotDraft.startTime || !slotDraft.endTime) {
                        window.alert('Date, start time, and end time are required.');
                        return;
                      }
                      addCourtAvailabilitySlot();
                      setShowAvailabilityForm(false);
                    }}
                  >
                    Save Slot
                  </button>
                  <button style={outlineBtn} onClick={() => setShowAvailabilityForm(false)}>Cancel</button>
                </div>
              </>
            )}

            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}>
              <thead>
                <tr>
                  {['Date', 'Start', 'End', 'Duration', 'Actions'].map((header) => (
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
                      <td style={td}>{formatDuration(slot.startTime, slot.endTime)}</td>
                      <td style={td}>
                        <button style={outlineBtn} onClick={() => removeCourtAvailabilitySlot(slot.id)}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td style={td} colSpan={5}>No availability slots added.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </>
        )}
      </section>

      <SaveRow enabled={courtDirty} onSave={saveCourtsConfig} />
    </div>
  );
}
