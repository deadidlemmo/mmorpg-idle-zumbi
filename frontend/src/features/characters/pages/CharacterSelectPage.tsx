import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../../store/auth.store';
import { deleteCharacter, getMyCharacters } from '../api/characters.api';
import '../characters.css';
import { CharacterCard } from '../components/CharacterCard';
import { CharacterCreateCard } from '../components/CharacterCreateCard';
import {
    CHARACTER_LIMIT,
    type CharacterSummary,
} from '../types/character.types';

export function CharacterSelectPage() {
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);

  const [characters, setCharacters] = useState<CharacterSummary[]>([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState('');
  const [characterToDelete, setCharacterToDelete] =
    useState<CharacterSummary | null>(null);
  const [deletingCharacterId, setDeletingCharacterId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const selectedCharacter = useMemo(
    () =>
      characters.find((character) => character.id === selectedCharacterId) ??
      null,
    [characters, selectedCharacterId],
  );

  const hasReachedLimit = characters.length >= CHARACTER_LIMIT;

  useEffect(() => {
    async function loadCharacters() {
      try {
        setIsLoading(true);
        setError('');

        const data = await getMyCharacters();

        if (data.length === 0) {
          navigate('/characters/new', { replace: true });
          return;
        }

        setCharacters(data);
        setSelectedCharacterId(data[0].id);
      } catch (err) {
        console.error(err);
        setError('Não foi possível carregar seus personagens.');
      } finally {
        setIsLoading(false);
      }
    }

    loadCharacters();
  }, [navigate]);

  function handleEnterGame() {
    if (!selectedCharacter) return;

    navigate(`/dashboard/${selectedCharacter.id}`);
  }

  function handleCreateCharacter() {
    if (hasReachedLimit) return;

    navigate('/characters/new');
  }

  function handleLogout() {
    logout();
    navigate('/', { replace: true });
  }

  async function handleConfirmDelete() {
    if (!characterToDelete) return;

    try {
      setError('');
      setDeletingCharacterId(characterToDelete.id);

      await deleteCharacter(characterToDelete.id);

      const updatedCharacters = characters.filter(
        (character) => character.id !== characterToDelete.id,
      );

      setCharacters(updatedCharacters);
      setCharacterToDelete(null);

      if (updatedCharacters.length === 0) {
        navigate('/characters/new', { replace: true });
        return;
      }

      if (selectedCharacterId === characterToDelete.id) {
        setSelectedCharacterId(updatedCharacters[0].id);
      }
    } catch (err: any) {
      console.error(err);

      const message =
        err?.response?.data?.message ??
        'Não foi possível excluir o personagem.';

      setError(Array.isArray(message) ? message[0] : message);
    } finally {
      setDeletingCharacterId('');
    }
  }

  if (isLoading) {
    return (
      <main className="character-page">
        <div className="character-loading card">
          <span className="loading-spinner" />
          <p>Carregando personagens...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="character-page">
      <section className="character-select-panel">
        <header className="character-page__header character-page__header--compact">
          <div className="character-page__title-block">
            <p className="page-eyebrow">Abrigo de sobreviventes</p>

            <div className="character-page__title-row">
              <h1>Seleção de personagem</h1>

              <span className="character-count">
                {characters.length}/{CHARACTER_LIMIT}
              </span>
            </div>
          </div>
        </header>

        {error ? <div className="form-error-box">{error}</div> : null}

        <div className="character-select-grid">
          {characters.map((character) => (
            <CharacterCard
              key={character.id}
              character={character}
              selected={selectedCharacterId === character.id}
              isDeleting={deletingCharacterId === character.id}
              onSelect={setSelectedCharacterId}
              onDelete={setCharacterToDelete}
            />
          ))}

          <CharacterCreateCard
            disabled={hasReachedLimit}
            onClick={handleCreateCharacter}
          />
        </div>

        <footer className="character-select-footer">
          <button
            type="button"
            className="btn btn-primary btn-lg"
            onClick={handleEnterGame}
            disabled={!selectedCharacter}
          >
            Entrar no jogo
          </button>

          <button
            type="button"
            className="character-logout"
            onClick={handleLogout}
          >
            Sair da conta
          </button>
        </footer>
      </section>

      {characterToDelete ? (
        <div className="character-delete-backdrop" role="presentation">
          <div
            className="character-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-character-title"
          >
            <p className="page-eyebrow">Excluir personagem</p>

            <h2 id="delete-character-title">
              Excluir {characterToDelete.name}?
            </h2>

            <p>
              Esta ação remove o personagem da sua seleção. O progresso será
              bloqueado e não aparecerá mais na conta.
            </p>

            <div className="character-delete-modal__actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setCharacterToDelete(null)}
                disabled={Boolean(deletingCharacterId)}
              >
                Cancelar
              </button>

              <button
                type="button"
                className="character-delete-confirm"
                onClick={handleConfirmDelete}
                disabled={Boolean(deletingCharacterId)}
              >
                {deletingCharacterId ? 'Excluindo...' : 'Excluir personagem'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

export default CharacterSelectPage;