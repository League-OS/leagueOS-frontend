import { disabledSaveBtn, editModeBadge, outlineBtn, primaryBtn, saveRow, sectionHeader, viewModeBadge, warnBtn } from './styles';

export function EditModeHeader({ enabled, label, onToggle }: { enabled: boolean; label: string; onToggle: () => void }) {
  return (
    <section style={sectionHeader}>
      <div>
        <span style={enabled ? editModeBadge : viewModeBadge}>
          {enabled ? 'Edit Mode' : 'View Mode'}
        </span>
      </div>
      <button style={enabled ? warnBtn : outlineBtn} onClick={onToggle}>
        {enabled ? 'Stop Editing' : `Edit ${label}`}
      </button>
    </section>
  );
}

export function SaveRow({ enabled, onSave }: { enabled: boolean; onSave: () => void }) {
  return (
    <div style={saveRow}>
      <button style={enabled ? primaryBtn : disabledSaveBtn} disabled={!enabled} onClick={onSave}>Save</button>
    </div>
  );
}

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: '1px solid #dbe3ef', borderRadius: 10, padding: 10 }}>
      <div style={{ color: '#64748b', fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{value}</div>
    </div>
  );
}
