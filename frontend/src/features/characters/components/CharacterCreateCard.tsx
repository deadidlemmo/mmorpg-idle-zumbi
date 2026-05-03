interface CharacterCreateCardProps {
  disabled: boolean;
  onClick: () => void;
}

export function CharacterCreateCard({ disabled, onClick }: CharacterCreateCardProps) {
  return (
    <button
      type="button"
      className="survivor-create-slot"
      onClick={onClick}
      disabled={disabled}
    >
      <span className="survivor-create-slot__icon">+</span>

      <div className="survivor-create-slot__text">
        <h3>Criar personagem</h3>

        <p>
          {disabled
            ? 'Limite de personagens atingido.'
            : 'Adicionar novo sobrevivente.'}
        </p>
      </div>
    </button>
  );
}