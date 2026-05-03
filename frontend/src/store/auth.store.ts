import { create } from 'zustand';
import { loginRequest, registerRequest } from '../features/auth/api/auth.api';
import type { AuthUser } from '../features/auth/types/auth.types';
import { getAuthToken, removeAuthToken, setAuthToken } from '../services/api/authToken';

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

function extractApiError(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error
  ) {
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

  return 'Não foi possível conectar ao servidor. Tente novamente.';
}

const initialToken = getAuthToken();

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: initialToken,
  isAuthenticated: Boolean(initialToken),
  isLoading: false,
  error: null,

  async login(email, password) {
    set({ isLoading: true, error: null });

    try {
      const response = await loginRequest({
        email: email.trim().toLowerCase(),
        password,
      });

      setAuthToken(response.accessToken);

      set({
        user: response.user,
        accessToken: response.accessToken,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      removeAuthToken();

      set({
        user: null,
        accessToken: null,
        isAuthenticated: false,
        isLoading: false,
        error: extractApiError(error),
      });

      throw error;
    }
  },

  async register(email, password) {
    set({ isLoading: true, error: null });

    try {
      const response = await registerRequest({
        email: email.trim().toLowerCase(),
        password,
      });

      setAuthToken(response.accessToken);

      set({
        user: response.user,
        accessToken: response.accessToken,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      removeAuthToken();

      set({
        user: null,
        accessToken: null,
        isAuthenticated: false,
        isLoading: false,
        error: extractApiError(error),
      });

      throw error;
    }
  },

  logout() {
    removeAuthToken();

    set({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  },

  clearError() {
    set({ error: null });
  },
}));