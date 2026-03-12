import { field, labelCol, modalBackdrop, modalCard, outlineBtn, saveEnabledStyle } from './styles';

type AddCourtModalProps = {
  show: boolean;
  courtName: string;
  setCourtName: (value: string) => void;
  setShowAddCourtModal: (value: boolean) => void;
  addCourt: () => void;
};

export function AddCourtModal({
  show,
  courtName,
  setCourtName,
  setShowAddCourtModal,
  addCourt,
}: AddCourtModalProps) {
  if (!show) return null;

  return (
    <div style={modalBackdrop}>
      <section style={modalCard}>
        <h3 style={{ marginTop: 0 }}>Add Court</h3>
        <label style={labelCol}>
          Court Name
          <input
            value={courtName}
            onChange={(event) => setCourtName(event.target.value)}
            placeholder="Court Name"
            style={field}
          />
        </label>
        <div style={{ marginTop: 10, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button style={outlineBtn} onClick={() => setShowAddCourtModal(false)}>Cancel</button>
          <button style={saveEnabledStyle(Boolean(courtName.trim()))} disabled={!courtName.trim()} onClick={addCourt}>Add Court</button>
        </div>
      </section>
    </div>
  );
}
