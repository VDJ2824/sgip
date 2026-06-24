import axios from 'axios';
import { getStoredToken, getStoredUser } from '@/utils/authStorage';

const API_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS || 45000);

function normalizeApiError(error) {
  const apiError = new Error(
    error?.response?.data?.error?.message ||
      error?.response?.data?.message ||
      error?.message ||
      'Something went wrong while contacting the API.',
  );

  apiError.status = error?.response?.status || 0;
  apiError.code = error?.response?.data?.error?.code || 'API_ERROR';
  apiError.details = error?.response?.data?.error?.details || null;
  apiError.requestId = error?.response?.data?.meta?.requestId || '';
  return apiError;
}

function createClient(baseURL) {
  const client = axios.create({
    baseURL,
    timeout: API_TIMEOUT_MS,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  client.interceptors.request.use((config) => {
    const token = getStoredToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    const requestId = crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    config.headers['x-request-id'] = requestId;
    return config;
  });

  client.interceptors.response.use(
    (response) => response.data,
    (error) => Promise.reject(normalizeApiError(error)),
  );

  return client;
}

export const api = createClient(import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1');
export const authApi = createClient(
  import.meta.env.VITE_AUTH_API_URL ||
    (import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace(/\/api\/v1\/?$/, '/api') : 'http://localhost:5000/api'),
);

export function getStudentId() {
  return (
    localStorage.getItem('sgip_student_id') ||
    getStoredUser()?._id ||
    ''
  );
}

export function buildQuery(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  );
}
