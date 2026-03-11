import { tabBtn, tabBtnActive } from './styles';
import type { ViewTab } from './types';

type FormatTabsProps = {
  activeTab: ViewTab;
  switchTab: (tab: ViewTab) => void;
};

export function FormatTabs({ activeTab, switchTab }: FormatTabsProps) {
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
      <button style={activeTab === 'config' ? tabBtnActive : tabBtn} onClick={() => switchTab('config')}>Config</button>
      <button style={activeTab === 'pool' ? tabBtnActive : tabBtn} onClick={() => switchTab('pool')}>Pool</button>
      <button style={activeTab === 'schedules' ? tabBtnActive : tabBtn} onClick={() => switchTab('schedules')}>Schedules</button>
      <button style={activeTab === 'courts' ? tabBtnActive : tabBtn} onClick={() => switchTab('courts')}>Courts</button>
    </div>
  );
}
