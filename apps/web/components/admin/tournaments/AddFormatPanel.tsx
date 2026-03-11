import { field, labelCol, outlineBtn, saveEnabledStyle, subCard } from './styles';
import type { FormatFormDraft, FormatType } from './types';

type AddFormatPanelProps = {
  mode: 'create' | 'edit';
  formDraft: FormatFormDraft;
  setFormDraft: (value: FormatFormDraft | ((prev: FormatFormDraft) => FormatFormDraft)) => void;
  formatFormError: string;
  setFormatFormError: (value: string) => void;
  onCancel: () => void;
  saveFormatBase: () => void;
};

export function AddFormatPanel({
  mode,
  formDraft,
  setFormDraft,
  formatFormError,
  setFormatFormError,
  onCancel,
  saveFormatBase,
}: AddFormatPanelProps) {
  const isEditMode = mode === 'edit';

  return (
    <article style={subCard}>
      <h3 style={{ marginTop: 0 }}>{isEditMode ? 'Edit Format' : 'Add Format Instance'}</h3>
      <p style={{ marginTop: 0, color: '#64748b' }}>
        {isEditMode
          ? 'Update format identity details. Save will reopen this format configuration.'
          : 'Define format identity first. Save will open that format configuration.'}
      </p>
      <div style={{ display: 'grid', gap: 8 }}>
        <label style={labelCol}>
          Format Name <span style={{ color: '#b91c1c' }}>*</span>
          <input
            value={formDraft.name}
            onChange={(event) => {
              setFormDraft((draft) => ({ ...draft, name: event.target.value }));
              if (event.target.value.trim()) setFormatFormError('');
            }}
            placeholder="Format Name"
            style={field}
          />
        </label>
        <label style={labelCol}>
          Format Type
          <select
            value={formDraft.type}
            onChange={(event) => {
              setFormDraft((draft) => ({ ...draft, type: event.target.value as FormatType }));
            }}
            style={field}
          >
            <option value="DOUBLES">Doubles</option>
            <option value="MIXED_DOUBLES">Mixed Doubles</option>
            <option value="SINGLES">Singles</option>
          </select>
        </label>
        <label style={labelCol}>
          Registration Start
          <input
            type="datetime-local"
            value={formDraft.regOpen}
            onChange={(event) => {
              setFormDraft((draft) => ({ ...draft, regOpen: event.target.value }));
            }}
            style={field}
          />
        </label>
        <label style={labelCol}>
          Registration End
          <input
            type="datetime-local"
            value={formDraft.regClose}
            onChange={(event) => {
              setFormDraft((draft) => ({ ...draft, regClose: event.target.value }));
            }}
            style={field}
          />
        </label>
        <label style={labelCol}>
          Auto Registration Close
          <select
            value={formDraft.autoClose ? 'yes' : 'no'}
            onChange={(event) => {
              setFormDraft((draft) => ({ ...draft, autoClose: event.target.value === 'yes' }));
            }}
            style={field}
          >
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
        {formatFormError ? <div style={{ color: '#b91c1c', fontWeight: 600 }}>{formatFormError}</div> : null}
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={outlineBtn} onClick={onCancel}>Cancel</button>
          <button
            style={saveEnabledStyle(Boolean(formDraft.name.trim()))}
            disabled={!formDraft.name.trim()}
            onClick={saveFormatBase}
          >
            {isEditMode ? 'Save' : 'Save Format'}
          </button>
        </div>
      </div>
    </article>
  );
}
