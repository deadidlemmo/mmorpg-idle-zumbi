import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createCharacter } from '../api/characters.api';
import '../characters.css';
import { CharacterCreateForm } from '../components/CharacterCreateForm';

export default function CharacterCreatePage() {
  const navigate = useNavigate();

  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleCreate(payload: { name: string; className: string }) {
    try {
      setError('');
      setIsSubmitting(true);

      await createCharacter(payload);

      navigate('/characters', { replace: true });
    } catch (err) {
      console.error(err);
      setError('Não foi possível criar o personagem. Verifique os dados e tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="character-page character-page--create">
      <section className="character-create-panel card">
        <div className="character-page__header character-page__header--center">
          <p className="page-eyebrow">Abrigo de sobreviventes</p>
          <h1>Criar personagem</h1>
          <p>Escolha sua classe inicial e dê um nome ao seu sobrevivente.</p>
        </div>

        {error ? <div className="form-error-box">{error}</div> : null}

        <CharacterCreateForm isSubmitting={isSubmitting} onCreate={handleCreate} />
      </section>
    </main>
  );
}