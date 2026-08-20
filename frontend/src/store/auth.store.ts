import { create } from 'zustand';
import {
  getMeRequest,
  loginRequest,
  registerRequest,
} from '../features/auth/api/auth.api';
import type { AuthUser } from '../features/auth/types/auth.types';
import { getAuthToken, removeAuthToken, setAuthToken } from '../services/api/authToken';

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    acceptTerms: boolean,
    acceptPrivacy: boolean,
  ) => Promise<void>;
  initialize: () => Promise<void>;
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
let initializationPromise: Promise<void> | null = null;

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: initialToken,
  isAuthenticated: Boolean(initialToken),
  isLoading: false,
  isInitialized: false,
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

  async register(email, password, acceptTerms, acceptPrivacy) {
    set({ isLoading: true, error: null });

    try {
      const response = await registerRequest({
        email: email.trim().toLowerCase(),
        password,
        acceptTerms,
        acceptPrivacy,
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

  async initialize() {
    if (initializationPromise) return initializationPromise;

    initializationPromise = (async () => {
      const token = getAuthToken();

      if (!token) {
        set({
          user: null,
          accessToken: null,
          isAuthenticated: false,
          isInitialized: true,
        });
        return;
      }

      try {
        const user = await getMeRequest();
        set({
          user,
          accessToken: token,
          isAuthenticated: true,
          isInitialized: true,
        });
      } catch {
        removeAuthToken();
        set({
          user: null,
          accessToken: null,
          isAuthenticated: false,
          isInitialized: true,
        });
      }
    })();

    await initializationPromise;
  },

  logout() {
    removeAuthToken();

    set({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
      isInitialized: true,
      error: null,
    });
  },

  clearError() {
    set({ error: null });
  },
}));
