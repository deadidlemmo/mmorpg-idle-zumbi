interface CharacterSelectHeaderProps {
  currentCount: number;
  limit: number;
}

export function CharacterSelectHeader({
  currentCount,
  limit,
}: CharacterSelectHeaderProps) {
  return (
    <header className="character-select-header">
      <p className="character-select-header__eyebrow">Abrigo de sobreviventes</p>

      <div className="character-select-header__row">
        <h1 className="character-select-header__title">Seleção de personagem</h1>

        <span className="character-select-header__badge">
          {currentCount}/{limit} personagens
        </span>
      </div>
    </header>
  );
}