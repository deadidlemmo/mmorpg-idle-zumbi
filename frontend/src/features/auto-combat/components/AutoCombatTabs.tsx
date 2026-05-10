import type { AutoCombatTab } from '../types/auto-combat-page.types';

type AutoCombatTabsProps = {
  activeTab: AutoCombatTab;
  onChange: (tab: AutoCombatTab) => void;
};

export function AutoCombatTabs({ activeTab, onChange }: AutoCombatTabsProps) {
  return (
    <div className="auto-combat-tabs" role="tablist">
      <button
        type="button"
        className={activeTab === 'battle' ? 'is-active' : ''}
        onClick={() => onChange('battle')}
      >
        Combate
      </button>

      <button
        type="button"
        className={activeTab === 'stats' ? 'is-active' : ''}
        onClick={() => onChange('stats')}
      >
        Status
      </button>
    </div>
  );
}
