import { create } from 'zustand';
import {
    createCharacterRequest,
    getMyCharactersRequest,
} from '../features/characters/api/characters.api';
import type {
    CharacterClassName,
    CharacterSummary,
} from '../features/characters/types/character.types';

const SELECTED_CHARACTER_KEY = 'dead_idle_selected_character_id';

interface CharacterState {
  characters: CharacterSummary[];
  selectedCharacterId: string | null;
  isLoading: boolean;
  isCreating: boolean;
  error: string | null;

  loadCharacters: () => Promise<void>;
  createCharacter: (name: string, className: CharacterClassName) => Promise<void>;
  selectCharacter: (characterId: string) => void;
  clearError: () => void;
  resetCharacters: () => void;
}

function extractApiError(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const apiError = error as {
      response?: {
        data?: {
          message?: string | string[];
          error?: string;
        };
      };
    };

    const message = apiError.response?.data?.message;

    if (Array.isArray(message)) {
      return message.join(' ');
    }

    if (typeof message === 'string') {
      return message;
    }

    if (typeof apiError.response?.data?.error === 'string') {
      return apiError.response.data.error;
    }
  }

  return 'Não foi possível carregar os personagens. Tente novamente.';
}

export const useCharacterStore = create<CharacterState>((set, get) => ({
  characters: [],
  selectedCharacterId: localStorage.getItem(SELECTED_CHARACTER_KEY),
  isLoading: false,
  isCreating: false,
  error: null,

  async loadCharacters() {
    set({ isLoading: true, error: null });

    try {
      const characters = await getMyCharactersRequest();

      const currentSelectedId = get().selectedCharacterId;
      const selectedStillExists = characters.some(
        (character) => character.id === currentSelectedId,
      );

      if (!selectedStillExists && currentSelectedId) {
        localStorage.removeItem(SELECTED_CHARACTER_KEY);
      }

      set({
        characters,
        selectedCharacterId: selectedStillExists ? currentSelectedId : null,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      set({
        characters: [],
        isLoading: false,
        error: extractApiError(error),
      });
    }
  },

  async createCharacter(name, className) {
    set({ isCreating: true, error: null });

    try {
      const createdCharacter = await createCharacterRequest({
        name: name.trim(),
        className,
      });

      const characters = [createdCharacter, ...get().characters];

      set({
        characters,
        isCreating: false,
        error: null,
      });

      get().selectCharacter(createdCharacter.id);
    } catch (error) {
      set({
        isCreating: false,
        error: extractApiError(error),
      });

      throw error;
    }
  },

  selectCharacter(characterId) {
    localStorage.setItem(SELECTED_CHARACTER_KEY, characterId);

    set({
      selectedCharacterId: characterId,
      error: null,
    });
  },

  clearError() {
    set({ error: null });
  },

  resetCharacters() {
    localStorage.removeItem(SELECTED_CHARACTER_KEY);

    set({
      characters: [],
      selectedCharacterId: null,
      isLoading: false,
      isCreating: false,
      error: null,
    });
  },
}));