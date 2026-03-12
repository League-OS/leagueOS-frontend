import { tabBtn, tabBtnActive } from './styles';
import type { ViewTab } from './types';

type FormatTabsProps = {
  activeTab: ViewTab;
  switchTab: (tab: ViewTab) => void;
};

export function FormatTabs({ activeTab, switchTab }: FormatTabsProps) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        gap: 4,
        marginBottom: 12,
        padding: '4px 4px 0',
        border: '1px solid #c9d8d1',
        borderRadius: '12px 12px 0 0',
        background: 'linear-gradient(180deg, #f8fbf9 0%, #f2f7f4 100%)',
      }}
    >
      <button style={activeTab === 'config' ? tabBtnActive : tabBtn} onClick={() => switchTab('config')}>Config</button>
      <button style={activeTab === 'pool' ? tabBtnActive : tabBtn} onClick={() => switchTab('pool')}>Pool</button>
      <button style={activeTab === 'schedules' ? tabBtnActive : tabBtn} onClick={() => switchTab('schedules')}>Schedules</button>
      <button style={activeTab === 'courts' ? tabBtnActive : tabBtn} onClick={() => switchTab('courts')}>Courts</button>
    </div>
  );
}
