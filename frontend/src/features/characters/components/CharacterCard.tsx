import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { getAvatarImage } from '../constants/avatar-options';
import {
    getCharacterClass,
    getCharacterInitials,
    type CharacterSummary,
} from '../types/character.types';

interface CharacterCardProps {
  character: CharacterSummary;
  selected: boolean;
  isDeleting?: boolean;
  onSelect: (characterId: string) => void;
  onDelete: (character: CharacterSummary) => void;
}

export function CharacterCard({
  character,
  selected,
  isDeleting = false,
  onSelect,
  onDelete,
}: CharacterCardProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const classData = getCharacterClass(character.classId);
  const avatarImage = getAvatarImage(character.avatarKey);

  const hpPercent = Math.max(
    0,
    Math.min(100, (character.hp / character.maxHp) * 100),
  );

  const style = {
    '--class-accent': classData.accentColor,
  } as CSSProperties;

  useEffect(() => {
    function handleClickOutside(event: globalThis.MouseEvent) {
      if (!cardRef.current) return;

      if (!cardRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen]);

  function handleSelect() {
    if (isDeleting) return;

    setIsMenuOpen(false);
    onSelect(character.id);
  }

  function handleKeyboardSelect(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') return;

    event.preventDefault();
    handleSelect();
  }

  function handleMenuClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();

    if (isDeleting) return;

    setIsMenuOpen((current) => !current);
  }

  function handleDeleteClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();

    if (isDeleting) return;

    setIsMenuOpen(false);
    onDelete(character);
  }

  return (
    <div
      ref={cardRef}
      className={`survivor-list-card ${selected ? 'is-selected' : ''} ${
        isDeleting ? 'is-disabled' : ''
      }`}
      style={style}
      role="button"
      tabIndex={0}
      onClick={handleSelect}
      onKeyDown={handleKeyboardSelect}
    >
      <button
        type="button"
        className={`survivor-list-card__menu-button ${
          isMenuOpen ? 'is-open' : ''
        }`}
        onClick={handleMenuClick}
        disabled={isDeleting}
        aria-label={`Abrir opções de ${character.name}`}
        aria-expanded={isMenuOpen}
      >
        <span />
        <span />
        <span />
      </button>

      {isMenuOpen ? (
        <div className="survivor-list-card__menu" role="menu">
          <button
            type="button"
            className="survivor-list-card__menu-item survivor-list-card__menu-item--danger"
            onClick={handleDeleteClick}
            disabled={isDeleting}
            role="menuitem"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M9 3h6l1 2h4v2H4V5h4l1-2Z" />
              <path d="M6 9h12l-.8 11H6.8L6 9Zm4 2v7h1.7v-7H10Zm2.3 0v7H14v-7h-1.7Z" />
            </svg>

            <span>{isDeleting ? 'Excluindo...' : 'Excluir personagem'}</span>
          </button>
        </div>
      ) : null}

      <div className="survivor-list-card__avatar">
        {avatarImage ? (
          <img src={avatarImage} alt={`Avatar de ${character.name}`} />
        ) : character.avatarUrl ? (
          <img src={character.avatarUrl} alt={`Avatar de ${character.name}`} />
        ) : (
          <span>{getCharacterInitials(character.name)}</span>
        )}
      </div>

      <div className="survivor-list-card__body">
        <div className="survivor-list-card__identity">
          <h3>{character.name}</h3>

          <div className="survivor-list-card__meta">
            <span>Lv. {character.level}</span>
            <strong>{classData.label}</strong>
          </div>
        </div>

        <div className="survivor-list-card__location">{character.location}</div>

        <div className="survivor-list-card__hp">
          <div className="survivor-list-card__hp-label">
            <span>HP</span>
            <strong>
              {character.hp}/{character.maxHp}
            </strong>
          </div>

          <div className="survivor-list-card__hp-bar">
            <i style={{ width: `${hpPercent}%` }} />
          </div>
        </div>
      </div>

      <div className="survivor-list-card__side">
        <img
          className="survivor-list-card__emblem"
          src={classData.emblem}
          alt={classData.label}
        />
      </div>
    </div>
  );
}