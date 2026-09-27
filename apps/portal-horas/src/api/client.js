import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || '';
const ARARA_URL = (import.meta.env.VITE_ARARA_API_URL ?? '').replace(/\/$/, '');
const ARARA_SLUG = import.meta.env.VITE_ARARA_APP_SLUG || 'portal-horas';
const ARARA_ENABLED = import.meta.env.VITE_ARARA_API_URL !== undefined;

export const api = axios.create({
  baseURL: baseURL || undefined,
  headers: { 'Content-Type': 'application/json' },
});

function snakeToCamel(key) {
  return key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function camelToSnake(key) {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function normalizeValue(value) {
  if (Array.isArray(value)) return value.map(normalizeRecord);
  if (value && typeof value === 'object') return normalizeRecord(value);
  return value;
}

function normalizeRecord(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[snakeToCamel(k)] = normalizeValue(v);
  }
  return out;
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function denormalizeValue(value) {
  if (Array.isArray(value)) return value.map(denormalizeValue);
  if (isPlainObject(value)) return denormalizeRecord(value);
  return value;
}

function denormalizeRecord(obj) {
  if (!isPlainObject(obj)) return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[camelToSnake(k)] = denormalizeValue(v);
  }
  return out;
}

/** Map legacy Express paths to Arara runtime routes. */
function mapAraraPath(url) {
  let path = url.startsWith('/api/') ? url.slice(4) : url;
  if (path.startsWith('/bip-schedule')) {
    path = path.replace('/bip-schedule', '/bip-schedules');
  }
  return `${ARARA_URL}/v1/r/${ARARA_SLUG}${path}`;
}

function getAppKey() {
  return localStorage.getItem(`arara_app_key:${ARARA_SLUG}`);
}

api.interceptors.request.use((config) => {
  if (ARARA_ENABLED && config.url?.startsWith('/api/')) {
    // Auth login/me stay on platform (login handled in AuthContext; skip /api/auth here)
    if (config.url.startsWith('/api/auth/')) {
      config.url = `${ARARA_URL}${config.url.replace('/api/auth', '/v1/auth')}`;
      const token = localStorage.getItem('token');
      if (token) {
        const value = `Bearer ${token}`;
        if (typeof config.headers.set === 'function') config.headers.set('Authorization', value);
        else config.headers.Authorization = value;
      }
      return config;
    }

    // Finance + users + squads + hour-entries: JWT identifies the user
    const jwtOnly =
      config.url.startsWith('/api/finance') ||
      config.url.startsWith('/api/users') ||
      config.url.startsWith('/api/squads') ||
      config.url.startsWith('/api/hour-entries');
    config.url = mapAraraPath(config.url);
    if (jwtOnly) {
      const token = localStorage.getItem('token');
      if (token) {
        const value = `Bearer ${token}`;
        if (typeof config.headers.set === 'function') {
          config.headers.set('Authorization', value);
          config.headers.delete('x-api-key');
        } else {
          config.headers.Authorization = value;
          delete config.headers['x-api-key'];
        }
      }
      if (config.data && typeof config.data === 'object' && !(config.data instanceof FormData)) {
        config.data = denormalizeRecord(config.data);
      }
      return config;
    }

    const appKey = getAppKey();
    if (appKey) {
      if (typeof config.headers.set === 'function') {
        config.headers.set('x-api-key', appKey);
        config.headers.delete('Authorization');
      } else {
        config.headers['x-api-key'] = appKey;
        delete config.headers.Authorization;
      }
    } else {
      // Fallback: JWT when app key mint failed / missing
      const token = localStorage.getItem('token');
      if (token) {
        const value = `Bearer ${token}`;
        if (typeof config.headers.set === 'function') config.headers.set('Authorization', value);
        else config.headers.Authorization = value;
      }
    }

    if (config.data && typeof config.data === 'object' && !(config.data instanceof FormData)) {
      config.data = denormalizeRecord(config.data);
    }
    return config;
  }

  // Legacy: SPA em /horas → backend local em /horas/api
  if (!baseURL && import.meta.env.PROD && config.url?.startsWith('/api')) {
    const prefix = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
    config.url = `${prefix}${config.url}`;
  }
  const token = localStorage.getItem('token');
  if (token) {
    const value = `Bearer ${token}`;
    if (typeof config.headers.set === 'function') config.headers.set('Authorization', value);
    else config.headers.Authorization = value;
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    if (!ARARA_ENABLED || !response.config?.url?.includes('/v1/r/')) {
      return response;
    }
    const body = response.data;
    if (body && typeof body === 'object' && 'data' in body) {
      const payload = body.data;
      if (Array.isArray(payload)) {
        response.data = payload.map(normalizeRecord);
      } else if (payload && typeof payload === 'object') {
        response.data = normalizeRecord(payload);
      } else {
        response.data = payload;
      }
    } else if (body && typeof body === 'object') {
      response.data = normalizeRecord(body);
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      const hadToken = !!localStorage.getItem('token');
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('arara_jwt');
      localStorage.removeItem(`arara_app_key:${ARARA_SLUG}`);
      const path = window.location.pathname.replace(/\/$/, '') || '/';
      const onAuthPage = path.endsWith('/login');
      if (hadToken && !onAuthPage) {
        const base = import.meta.env.BASE_URL || '/';
        window.location.href = base.endsWith('/') ? `${base}login` : `${base}/login`;
      }
    }
    return Promise.reject(error);
  }
);

export function getErrorMessage(err) {
  const data = err.response?.data;
  if (data?.error) return data.error;
  if (Array.isArray(data?.errors)) return data.errors.map((e) => e.msg).join(', ');
  return err.message || 'Request failed';
}
