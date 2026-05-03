import { apiClient } from '../../../services/api/apiClient';
import { API_ENDPOINTS } from '../../../services/api/endpoints';
import type {
    AuthResponse,
    AuthUser,
    LoginRequest,
    RegisterRequest,
} from '../types/auth.types';

export async function loginRequest(
  payload: LoginRequest,
): Promise<AuthResponse> {
  const response = await apiClient.post<AuthResponse>(
    API_ENDPOINTS.auth.login,
    payload,
  );

  return response.data;
}

export async function registerRequest(
  payload: RegisterRequest,
): Promise<AuthResponse> {
  const response = await apiClient.post<AuthResponse>(
    API_ENDPOINTS.auth.register,
    payload,
  );

  return response.data;
}

export async function getMeRequest(): Promise<AuthUser> {
  const response = await apiClient.get<AuthUser>(API_ENDPOINTS.auth.me);

  return response.data;
}