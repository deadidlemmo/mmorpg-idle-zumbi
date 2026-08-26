import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { CharacterPortrait } from '../../cosmetics/components/CharacterPortrait';
import {
  getCosmeticEffectClass,
  getCosmeticImage,
} from '../../cosmetics/constants/cosmetic-assets';
import {
  getCharacterClass,
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
  const appearance = character.appearance ?? null;
  const bannerImage = getCosmeticImage(appearance?.profileBanner?.assetKey);
  const effectClass = getCosmeticEffectClass(
    appearance?.profileEffect?.effectPreset,
  );
  const accentColor = appearance?.accentColor ?? classData.accentColor;

  const hpPercent = Math.max(
    0,
    Math.min(100, (character.hp / character.maxHp) * 100),
  );

  const style = {
    '--class-accent': accentColor,
    '--hero-accent': accentColor,
    ...(bannerImage
      ? { '--character-card-banner-image': `url("${bannerImage}")` }
      : {}),
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
      className={[
        'survivor-list-card',
        'cosmetic-surface',
        bannerImage ? 'has-cosmetic-banner' : '',
        effectClass,
        selected ? 'is-selected' : '',
        isDeleting ? 'is-disabled' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={handleSelect}
      onKeyDown={handleKeyboardSelect}
    >
      <span className="cosmetic-effect-layer" aria-hidden="true" />

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

      <CharacterPortrait
        className="survivor-list-card__avatar"
        name={character.name}
        avatarKey={character.avatarKey}
        avatarUrl={character.avatarUrl}
        appearance={appearance}
      />

      <div className="survivor-list-card__body">
        <div className="survivor-list-card__identity">
          <div className="survivor-list-card__kicker">
            <span>{classData.label}</span>
            {appearance?.badge?.displayText ? (
              <strong title={appearance.badge.name}>
                {appearance.badge.displayText}
              </strong>
            ) : null}
          </div>

          <h3>{character.name}</h3>

          {appearance?.title?.displayText ? (
            <small className="survivor-list-card__cosmetic-title">
              {appearance.title.displayText}
            </small>
          ) : null}
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
        <div
          className="survivor-list-card__level"
          aria-label={`Nível ${character.level}`}
        >
          <span>Nível</span>
          <strong>{character.level}</strong>
        </div>

        <img
          className="survivor-list-card__emblem"
          src={classData.emblem}
          alt=""
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
