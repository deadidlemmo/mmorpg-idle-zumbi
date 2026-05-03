import { useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import {
    getAvatarsByClass,
    type CharacterAvatarKey,
} from '../constants/avatar-options';
import {
    CHARACTER_CLASS_OPTIONS,
    type CharacterClassId,
    type CreateCharacterPayload,
} from '../types/character.types';

interface CharacterCreateFormProps {
  isSubmitting?: boolean;
  onCreate: (payload: CreateCharacterPayload) => Promise<void> | void;
}

export function CharacterCreateForm({
  isSubmitting = false,
  onCreate,
}: CharacterCreateFormProps) {
  const [name, setName] = useState('');
  const [selectedClass, setSelectedClass] =
    useState<CharacterClassId>('lutador');
  const [selectedAvatarKey, setSelectedAvatarKey] =
    useState<CharacterAvatarKey>('lutador-01');

  const selectedClassData = CHARACTER_CLASS_OPTIONS[selectedClass];

  const availableAvatars = useMemo(
    () => getAvatarsByClass(selectedClass),
    [selectedClass],
  );

  const selectedAvatar =
    availableAvatars.find((avatar) => avatar.key === selectedAvatarKey) ??
    availableAvatars[0];

  const canSubmit =
    name.trim().length >= 3 && Boolean(selectedAvatar?.key) && !isSubmitting;

  function handleClassChange(classId: CharacterClassId) {
    if (isSubmitting) return;

    const firstAvatar = getAvatarsByClass(classId)[0];

    setSelectedClass(classId);

    if (firstAvatar) {
      setSelectedAvatarKey(firstAvatar.key);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit || !selectedAvatar) return;

    await onCreate({
      name: name.trim(),
      className: selectedClassData.label,
      avatarKey: selectedAvatar.key,
    });
  }

  return (
    <form className="character-create-form" onSubmit={handleSubmit}>
      <div className="character-create-form__preview">
        <div
          className="character-create-form__avatar character-create-form__avatar--portrait"
          style={
            {
              '--class-accent': selectedClassData.accentColor,
            } as CSSProperties
          }
        >
          {selectedAvatar ? (
            <img src={selectedAvatar.image} alt={selectedAvatar.label} />
          ) : (
            <img src={selectedClassData.emblem} alt={selectedClassData.label} />
          )}
        </div>

        <div>
          <span>Novo sobrevivente</span>
          <h2>{name.trim() || 'Sem nome'}</h2>
          <p>{selectedClassData.label}</p>
        </div>
      </div>

      <div className="form-field">
        <label className="form-label" htmlFor="character-name">
          Nome do personagem
        </label>

        <input
          id="character-name"
          className="input"
          type="text"
          placeholder="Ex: Neto Aprendiz"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={24}
          disabled={isSubmitting}
          autoComplete="off"
        />
      </div>

      <div className="form-field">
        <span className="form-label">Classe inicial</span>

        <div className="character-class-grid">
          {Object.values(CHARACTER_CLASS_OPTIONS).map((classOption) => {
            const isActive = selectedClass === classOption.id;

            return (
              <button
                key={classOption.id}
                type="button"
                className={`character-class-button ${
                  isActive ? 'is-active' : ''
                }`}
                style={
                  {
                    '--class-accent': classOption.accentColor,
                  } as CSSProperties
                }
                onClick={() => handleClassChange(classOption.id)}
                disabled={isSubmitting}
              >
                <img src={classOption.emblem} alt={classOption.label} />

                <div>
                  <strong>{classOption.label}</strong>
                  <span>{classOption.description}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="character-avatar-picker">
        <div className="character-avatar-picker__header">
          <strong>Avatar inicial</strong>
          <span>Escolha a aparência do seu sobrevivente.</span>
        </div>

        <div
          className="character-avatar-grid"
          style={
            {
              '--class-accent': selectedClassData.accentColor,
            } as CSSProperties
          }
        >
          {availableAvatars.map((avatar) => {
            const isActive = selectedAvatarKey === avatar.key;

            return (
              <button
                key={avatar.key}
                type="button"
                className={`character-avatar-option ${
                  isActive ? 'is-active' : ''
                }`}
                onClick={() => setSelectedAvatarKey(avatar.key)}
                disabled={isSubmitting}
                aria-label={avatar.label}
              >
                <img src={avatar.image} alt="" />
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="submit"
        className="btn btn-primary btn-lg w-full"
        disabled={!canSubmit}
      >
        {isSubmitting ? 'Criando...' : 'Criar personagem'}
      </button>
    </form>
  );
}