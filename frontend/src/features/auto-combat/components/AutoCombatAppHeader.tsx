export function AutoCombatAppHeader() {
  return (
    <header className="auto-combat-app-header">
      <button
        type="button"
        className="auto-combat-back-button"
        onClick={() => window.history.back()}
      >
        ‹ Voltar
      </button>

      <strong>Combate</strong>

      <span />
    </header>
  );
}
