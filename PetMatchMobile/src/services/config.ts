// Centralized feature flags and service config
// Enable backend chat API so mobile can enrich chat list items
// with participant and pet details, matching the web frontend behavior.
export const CHAT_API_ENABLED = true;
export const ENABLE_API_DEBUG_LOGS = false;

// Local development overrides for backend-driven feature flags. Only applied
// when __DEV__ is true. Set a flag to `true`/`false` to force it; leave a
// key out (or set it to `undefined`) to fall back to the backend / cached
// value. Use this when the backend has a flag turned off but you still need
// to develop the gated UI locally (e.g. the Services strip on Home).
export const LOCAL_FEATURE_OVERRIDES: Partial<{
  clinicHomeEnabled: boolean;
  clinicMapEnabled: boolean;
  serverMapClusteringEnabled: boolean;
  requestChatV2Enabled: boolean;
}> = {
  clinicHomeEnabled: true,
  clinicMapEnabled: true,
  // requestChatV2Enabled: true,  // uncomment in dev to see the new flow
};

// Canonical domains
export const API_HOST = 'https://api.petow.app';
export const API_BASE_URL = `${API_HOST}/api`;
export const PUBLIC_WEB_URL = 'https://petow.app';
