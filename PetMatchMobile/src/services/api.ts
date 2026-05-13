import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import {
  CHAT_API_ENABLED,
  API_BASE_URL,
  ENABLE_API_DEBUG_LOGS,
} from './config';
import { resolveMediaUrl } from '../utils/mediaUrl';

// Canonical mobile API host (configured in services/config)
const BASE_URL = API_BASE_URL;
const SHOULD_LOG_API_DEBUG = __DEV__ && ENABLE_API_DEBUG_LOGS;
const MAP_MARKERS_ENDPOINT_PATTERN = /\/(pets|clinics)\/map\/markers\//;

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  errorData?: any;
  status?: number;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone?: string;
  is_phone_verified: boolean;
  address?: string;
  latitude?: number;
  longitude?: number;
  profile_picture?: string;
  is_verified: boolean;
  pets_count: number;
  date_joined: string;
  notify_breeding_requests?: boolean;
  notify_adoption_pets?: boolean;
  auth_provider?: 'email' | 'google';
}

export interface AccountVerification {
  id: number;
  status: 'pending' | 'approved' | 'rejected';
  status_display: string;
  admin_notes?: string;
  created_at: string;
  reviewed_at?: string;
}

export interface VerificationStatus {
  has_verification: boolean;
  is_verified: boolean;
  verification?: AccountVerification;
  message?: string;
}

export interface AdoptionRequest {
  id: number;
  adopter: number;
  pet: Pet;
  adopter_name: string;
  adopter_email: string;
  adopter_phone: string;
  adopter_age: number;
  adopter_occupation: string;
  adopter_address: string;
  adopter_latitude?: number;
  adopter_longitude?: number;
  housing_type: string;
  family_members: number;
  experience_level: string;
  time_availability: string;
  reason_for_adoption: string;
  family_agreement: boolean;
  agrees_to_follow_up: boolean;
  agrees_to_vet_care: boolean;
  agrees_to_training: boolean;
  feeding_plan: string | null;
  exercise_plan: string | null;
  vet_care_plan: string | null;
  emergency_plan: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  notes?: string;
  admin_notes?: string;
  created_at: string;
  updated_at: string;
  approved_at?: string;
  completed_at?: string;
}

export interface Breed {
  id: number;
  name: string;
  pet_type: string;
  description?: string;
}

export interface Clinic {
  id: number;
  name: string;
  code?: string;
  address?: string;
  city?: string;
  phone?: string;
  email?: string;
  working_hours?: string;
  workingHours?: string;
  is_active?: boolean;
  isActive?: boolean;
  latitude?: number;
  longitude?: number;
  distance?: number;
  distance_display?: string;
  logo?: string;
  logo_url?: string;
  storefront_primary_color?: string;
  opening_hours?: string;
  services?: string;
  service_categories?: string[];
  description?: string;
  has_dashboard?: boolean;
  dashboard_enabled?: boolean;
  has_storefront?: boolean;
}

export interface Pet {
  id: number;
  name: string;
  pet_type: string;
  pet_type_display: string;
  breed: number;
  breed_name: string;
  age_months: number;
  age_display: string;
  gender: string;
  gender_display: string;
  description: string;
  location: string;
  latitude?: number;
  longitude?: number;
  is_free: boolean;
  price?: number;
  price_display?: string;
  status: string;
  status_display: string;
  main_image?: string;
  image_2?: string;
  image_3?: string;
  image_4?: string;
  vaccination_certificate?: string;
  health_certificate?: string;
  disease_free_certificate?: string;
  additional_certificate?: string;
  owner_name: string;
  owner_email: string;
  owner_is_verified?: boolean;
  created_at: string;
  updated_at: string;
  // Numeric distance in km (float). Use this for sorting/color thresholds;
  // don't parse `distance_display` because its unit switches between
  // "متر" (<1 km) and "كم" (>=1 km).
  distance?: number;
  distance_display?: string;
  has_health_certificates: boolean;
  hosting_preference?: string;
}

export interface PetMapPoint {
  id: number;
  name: string;
  pet_type: string;
  pet_type_display: string;
  breed_name: string;
  age_display: string;
  age_months?: number;
  gender: string;
  gender_display: string;
  main_image?: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  distance?: number;
  distance_display?: string;
  status?: string;
  status_display?: string;
  hosting_preference?: string;
}

export interface ClinicMapPoint {
  id: number;
  name: string;
  address?: string;
  city?: string;
  phone?: string;
  email?: string;
  logo?: string;
  opening_hours?: string;
  services?: string;
  storefront_primary_color?: string;
  latitude?: number;
  longitude?: number;
  is_active?: boolean;
  service_categories?: string[];
  distance?: number;
  distance_display?: string;
}

export interface MapCluster {
  id: string;
  latitude: number;
  longitude: number;
  count: number;
  entity_type: 'pet' | 'clinic';
}

export interface MapPoint<T> {
  entity_type: 'pet' | 'clinic';
  data: T;
}

export interface MapMarkersMeta {
  zoom: number;
  bbox: {
    min_lng: number;
    min_lat: number;
    max_lng: number;
    max_lat: number;
  };
  total_matched?: number;
  returned_clusters: number;
  returned_points: number;
  truncated: boolean;
}

export interface MapMarkersResponse<T> {
  clusters: MapCluster[];
  points: T[];
  meta: MapMarkersMeta;
}

export interface MapRequestStats {
  endpoint: string;
  status: number;
  duration_ms: number;
  returned_points?: number;
  returned_clusters?: number;
  truncated?: boolean;
}

export interface MapsAutocompletePrediction {
  place_id: string;
  description: string;
  main_text?: string;
  secondary_text?: string;
}

export interface MapsAutocompleteResponse {
  predictions: MapsAutocompletePrediction[];
}

export interface MapsGeocodeResponse {
  address: string;
  lat: number;
  lng: number;
}


// Chat Interfaces
export interface ChatRoom {
  id: number;
  firebase_chat_id: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  participants: Record<string, ChatParticipant>;
  other_participant: ChatParticipant | null;
  pet_details: ChatPetDetails | null;
}

export interface ChatParticipant {
  id: number;
  name: string;
  email: string;
  phone: string;
  is_verified?: boolean;
}

export interface ChatPetDetails {
  id: number;
  name: string;
  breed_name: string;
  pet_type_display: string;
  main_image?: string;
}

export interface ChatRoomList {
  id: number;
  firebase_chat_id: string;
  created_at: string;
  updated_at: string;
  other_participant: string;
  other_participant_is_verified?: boolean;
  other_participant_avatar?: string;  // person's profile picture (preferred over pet_image for the avatar)
  pet_name: string;
  pet_image?: string;
  // Forward-compatible inbox fields. Populated by backend / firestore listener
  // when available; the UI hides the row gracefully when undefined.
  unread_count?: number;
  last_message?: string;
  last_message_at?: string;
}

export interface ChatContext {
  chat_id: string;
  breeding_request?: {
    id: number;
    status: string;
    created_at: string;
    message?: string;
  } | null;
  adoption_request?: {
    id: number;
    status: string;
    created_at: string;
    message?: string;
  } | null;
  clinic?: {
    id: number | null;
    name: string | null;
  } | null;
  patient?: {
    id: number;
    name: string | null;
    species: string | null;
    breed: string | null;
    owner_name: string | null;
    owner_email: string | null;
    owner_phone: string | null;
  } | null;
  pet: (ChatPetDetails & { owner_name?: string | null }) | null;
  participants: Record<string, ChatParticipant>;
  metadata: {
    created_at: string;
    updated_at: string;
    is_active: boolean;
  };
}

export type ChatPhase =
  | 'pending'
  | 'approved'
  | 'approved_pending_kyc'
  | 'approved_kyc_pending_review'
  | 'approved_kyc_rejected'
  | 'rejected';

export interface ChatStatus {
  id: number;
  firebase_chat_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  breeding_request_status: string;
  participants_count: number;
  // Stage 2: backend will populate this. Stage 1: undefined → derive client-side.
  chat_status?: ChatPhase;
}

export interface UserChatStatus {
  active_chats?: number;
  archived_chats?: number;
  total_chats?: number;
  pending_chat_creation?: number;
  user_id?: number;
  user_name?: string;
  unread_messages_count?: number;
  has_unread_messages?: boolean;
  has_active_chats?: boolean;
  active_chats_count?: number;
}

class ApiService {
  private async getToken(): Promise<string | null> {
    try {
      const token = await AsyncStorage.getItem('authToken');
      return token;
    } catch (error) {
      if (SHOULD_LOG_API_DEBUG) {
        console.error('❌ Error getting token from AsyncStorage:', error);
      }
      return null;
    }
  }

  /**
   * Extract a relative API path from a possibly absolute "next" URL.
   * Handles different schemes, duplicate /api/ segments, and returns a path usable by this.request()
   */
  private extractPathFromFullUrl(fullUrl: string): string {
    try {
      // Use BASE_URL as reference
      const base = new URL((BASE_URL.endsWith('/') ? BASE_URL : BASE_URL + '/'));
      const url = new URL(fullUrl, base.href);
      let path = url.pathname + url.search;

      // Normalize duplicate /api/ if present
      if (path.startsWith('/api/api/')) {
        path = path.replace('/api/api/', '/api/');
      }

      // Our request() already prefixes BASE_URL, which includes /api
      // So strip a leading /api if present
      if (path.startsWith('/api/')) {
        path = path.substring(4);
      }

      // Ensure leading slash
      if (!path.startsWith('/')) {
        path = '/' + path;
      }

      return path;
    } catch (_e) {
      // Fallback: strip origin part manually if absolute
      if (/^https?:\/\//i.test(fullUrl)) {
        const withoutOrigin = fullUrl.replace(/^https?:\/\/[^/]+/i, '');
        return withoutOrigin.startsWith('/api/')
          ? withoutOrigin.substring(4)
          : withoutOrigin;
      }
      return fullUrl;
    }
  }

  // Push notifications
  async registerPushToken(token: string, platform: string): Promise<ApiResponse<{ message: string }>> {
    // Primary endpoint for this backend.
    try {
      const res = await this.request<{ message: string }>(`/accounts/update-notification-token/`, {
        method: 'POST',
        body: JSON.stringify({ fcm_token: token, platform }),
      });
      return res;
    } catch {}
    // Legacy fallback path for older deployments.
    try {
      const res2 = await this.request<{ message: string }>(`/notifications/register-device/`, {
        method: 'POST',
        body: JSON.stringify({ fcm_token: token, platform }),
      });
      return res2;
    } catch (error) {
      console.log('registerPushToken: backend not available', error);
      return { success: false, error: 'registerPushToken failed' };
    }
  }

  private async setToken(token: string): Promise<void> {
    try {
      await AsyncStorage.setItem('authToken', token);
      console.log('✅ Token saved to AsyncStorage');
    } catch (error) {
      console.error('❌ Error saving token to AsyncStorage:', error);
    }
  }

  private async removeToken(): Promise<void> {
    try {
      await AsyncStorage.removeItem('authToken');
      console.log('✅ Token removed from AsyncStorage');
    } catch (error) {
      console.error('❌ Error removing token from AsyncStorage:', error);
    }
  }

  private async getAuthHeaders() {
    const token = await this.getToken();
    return {
      'Authorization': `Token ${token}`,
    };
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const startedAt = Date.now();
    try {
      const requestUrl = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint}`;
      const isMapMarkersEndpoint = MAP_MARKERS_ENDPOINT_PATTERN.test(requestUrl);
      if (SHOULD_LOG_API_DEBUG) {
        console.log(`🌐 Making API request to: ${requestUrl}`);
        console.log(`📤 Request method: ${options.method || 'GET'}`);
        if (!isMapMarkersEndpoint) {
          if (options.body instanceof FormData) {
            console.log('📤 Request body: FormData');
          } else if (typeof options.body !== 'undefined') {
            console.log(`📤 Request body: ${options.body}`);
          }
        }
      }

      const token = await this.getToken();
      const headers: Record<string, string> = {
        ...(options.headers as Record<string, string> || {}),
      };

      if (!(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
      }

      if (token) {
        headers['Authorization'] = `Token ${token}`;
        if (SHOULD_LOG_API_DEBUG) {
          console.log('🔑 Using token for authorization');
        }
      }

      const response = await fetch(requestUrl, {
        headers,
        ...options,
      });

      if (response.status === 204 || response.status === 205) {
        return {
          success: true,
          status: response.status,
        };
      }

      const contentType = response.headers.get('content-type') || '';
      const rawText = await response.text();
      const hasBody = rawText.trim().length > 0;
      let data: any = undefined;

      if (hasBody && contentType.includes('application/json')) {
        try {
          data = JSON.parse(rawText);
        } catch (jsonError) {
          console.error('❌ JSON parsing error:', jsonError);
          return {
            success: false,
            error: 'Invalid JSON response',
            status: response.status,
          };
        }
      } else if (hasBody) {
        if (response.ok) {
          data = rawText;
        } else {
          // Non-JSON error response (e.g., HTML 404 page). Avoid logging full HTML.
          const snippet = rawText.slice(0, 200).replace(/\n/g, ' ');
          console.warn(`⚠️ Non-JSON response (${response.status} ${response.statusText}): ${snippet}...`);
          return {
            success: false,
            error: `HTTP ${response.status}`,
            status: response.status,
          };
        }
      }

      if (SHOULD_LOG_API_DEBUG) {
        if (isMapMarkersEndpoint) {
          const mapData = data as Partial<MapMarkersResponse<unknown>> | null;
          const mapMeta = mapData?.meta;
          const stats: MapRequestStats = {
            endpoint,
            status: response.status,
            duration_ms: Date.now() - startedAt,
            returned_points: mapMeta?.returned_points,
            returned_clusters: mapMeta?.returned_clusters,
            truncated: mapMeta?.truncated,
          };
          console.log('🗺️ Map response summary:', stats);
        } else {
          console.log(`📥 Response status: ${response.status}`);
          console.log('📥 Response data:', data);
        }
      }

      if (response.ok) {
        return {
          success: true,
          ...(typeof data !== 'undefined' ? { data } : {}),
          status: response.status,
        };
      } else {
        const formattedError = this.formatErrorMessage(data) || `HTTP ${response.status}`;
        return {
          success: false,
          error: formattedError,
          errorData: data,
          status: response.status,
        };
      }
    } catch (error) {
      if (SHOULD_LOG_API_DEBUG) {
        console.error('❌ Network error:', error);
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }


  private formatErrorMessage(errorData: any): string | undefined {
    if (errorData === null || errorData === undefined) {
      return undefined;
    }

    if (typeof errorData === 'string') {
      const trimmed = errorData.trim();
      return trimmed.length ? trimmed : undefined;
    }

    if (Array.isArray(errorData)) {
      const normalized = errorData
        .map(item => this.formatErrorMessage(item))
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
      return normalized.length ? normalized.join(", ") : undefined;
    }

    if (typeof errorData === 'object') {
      const parts: string[] = [];
      const friendlyKeys = new Set(['non_field_errors', 'detail', 'error', 'message', 'errors']);

      Object.entries(errorData).forEach(([key, value]) => {
        const formattedValue = this.formatErrorMessage(value);
        if (!formattedValue) {
          return;
        }

        if (friendlyKeys.has(key)) {
          parts.push(formattedValue);
        } else {
          parts.push(`${key}: ${formattedValue}`);
        }
      });

      return parts.length ? parts.join(", ") : undefined;
    }

    return String(errorData);
  }

  // Authentication endpoints
  async login(email: string, password: string): Promise<ApiResponse<{ key: string; user: User }>> {
    const response = await this.request<{ key: string; user: User }>('/auth/login/', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (response.success && response.data?.key) {
      await this.setToken(response.data.key);
    }

    return response;
  }

  async googleLogin(idToken: string): Promise<ApiResponse<{ key: string; user: User; is_new_user: boolean; google_picture?: string }>> {
    const response = await this.request<{ key: string; user: User; is_new_user: boolean; google_picture?: string }>('/accounts/google-login/', {
      method: 'POST',
      body: JSON.stringify({ id_token: idToken }),
    });

    if (response.success && response.data?.key) {
      await this.setToken(response.data.key);
    }

    return response;
  }

  async sendPasswordResetOTP(email: string): Promise<ApiResponse<{ success?: boolean; message?: string; debug_otp?: string }>> {
    return this.request<{ success?: boolean; message?: string; debug_otp?: string }>(
      '/accounts/send-password-reset-otp/',
      {
        method: 'POST',
        body: JSON.stringify({ email }),
      }
    );
  }

  async verifyPasswordResetOTP(email: string, otpCode: string): Promise<ApiResponse<{ success?: boolean; message?: string; reset_token?: string }>> {
    return this.request<{ success?: boolean; message?: string; reset_token?: string }>(
      '/accounts/verify-password-reset-otp/',
      {
        method: 'POST',
        body: JSON.stringify({ email, otp_code: otpCode }),
      }
    );
  }

  async resetPasswordConfirm(resetToken: string, newPassword: string, confirmPassword: string): Promise<ApiResponse<{ success?: boolean; message?: string }>> {
    return this.request<{ success?: boolean; message?: string }>(
      '/accounts/reset-password-confirm/',
      {
        method: 'POST',
        body: JSON.stringify({
          reset_token: resetToken,
          new_password: newPassword,
          confirm_password: confirmPassword,
        }),
      }
    );
  }

  async register(userData: {
    email: string;
    password1: string;
    password2: string;
    first_name: string;
    last_name: string;
    phone: string;
  }): Promise<ApiResponse<{ key: string; user: User }>> {
    const response = await this.request<{ key: string; user: User }>('/auth/register/', {
      method: 'POST',
      body: JSON.stringify(userData),
    });

    if (response.success && response.data?.key) {
      await this.setToken(response.data.key);
    }

    return response;
  }

  async sendPhoneVerificationOtp(phoneNumber: string): Promise<ApiResponse<{ message?: string; expires_in?: number; sms_sent?: boolean; debug_otp?: string }>> {
    const sanitized = phoneNumber ? phoneNumber.replace(/\s+/g, '') : '';
    return this.request<{ message?: string; expires_in?: number; sms_sent?: boolean; debug_otp?: string }>(
      '/accounts/send-phone-otp/',
      {
        method: 'POST',
        body: JSON.stringify({ phone_number: sanitized }),
      }
    );
  }

  async verifyPhoneOtp(phoneNumber: string, otpCode: string): Promise<ApiResponse<{ message?: string; user: User }>> {
    const sanitized = phoneNumber ? phoneNumber.replace(/\s+/g, '') : '';
    return this.request<{ message?: string; user: User }>(
      '/accounts/verify-phone-otp/',
      {
        method: 'POST',
        body: JSON.stringify({ phone_number: sanitized, otp_code: otpCode.trim() }),
      }
    );
  }

  async logout(): Promise<void> {
    await this.removeToken();
  }

  // Breeds endpoint - With pagination to get all breeds
  async getBreeds(): Promise<Breed[]> {
    try {
      console.log('🔍 Loading all breeds with pagination...');
      const allBreeds: Breed[] = [];
      let nextUrl = '/pets/breeds/';
      let pageCount = 0;
      
      while (nextUrl && pageCount < 10) { // Safety limit to prevent infinite loops
        pageCount++;
        console.log(`🔍 Fetching page ${pageCount}: ${nextUrl}`);
        
        const response = await this.request<PaginatedResponse<Breed>>(nextUrl);
        
        if (response.success && response.data) {
          const pageBreeds = response.data.results || [];
          allBreeds.push(...pageBreeds);
          console.log(`✅ Loaded ${pageBreeds.length} breeds from page ${pageCount}`);
          console.log(`📊 Total breeds so far: ${allBreeds.length}`);
          
          // Check if there's a next page
          if (response.data.next) {
            // Extract the path from the full URL
            // Simple string manipulation to extract path from full URL
            // From "http://.../api/pets/breeds/?page=2" get "/pets/breeds/?page=2"
            const baseUrl = API_BASE_URL;
            nextUrl = response.data.next.replace(baseUrl, "");
            console.log(`🔍 Next page URL: ${nextUrl}`);
            console.log(`🔍 Next page URL: ${nextUrl}`);
          } else {
            nextUrl = '';
            console.log('🔍 No more pages available');
          }
        } else {
          console.error('❌ Failed to load breeds from page:', response.error);
          break;
        }
      }
      
      console.log(`🎉 Total breeds loaded: ${allBreeds.length}`);
      
      // Log breed distribution
      const catsBreeds = allBreeds.filter(breed => breed.pet_type === 'cats');
      const dogsBreeds = allBreeds.filter(breed => breed.pet_type === 'dogs');
      console.log(`🐱 Cats breeds: ${catsBreeds.length}`);
      console.log(`🐕 Dogs breeds: ${dogsBreeds.length}`);
      
      return allBreeds;
    } catch (error) {
      console.error('❌ Error loading breeds:', error);
      return [];
    }
  }

  // Pet endpoints
  async getPets(params?: {
    search?: string;
    pet_type?: string;
    gender?: string;
    status?: string;
    exclude_status?: string;
    location?: string;
    min_price?: number;
    max_price?: number;
    min_age_months?: number;
    max_age_months?: number;
    breed?: number;
    ordering?: string;
    page?: number;
    page_size?: number;  // إضافة page_size
    user_lat?: number;
    user_lng?: number;
  }): Promise<ApiResponse<PaginatedResponse<Pet>>> {
    const queryParams = new URLSearchParams();
    
    if (params?.search) queryParams.append('search', params.search);
    if (params?.pet_type) queryParams.append('pet_type', params.pet_type);
    if (params?.gender) queryParams.append('gender', params.gender);
    if (params?.status) queryParams.append('status', params.status);
    if (params?.exclude_status) queryParams.append('exclude_status', params.exclude_status);
    if (params?.location) queryParams.append('location', params.location);
    if (params?.min_price) queryParams.append('min_price', params.min_price.toString());
    if (params?.max_price) queryParams.append('max_price', params.max_price.toString());
    if (params?.breed) queryParams.append('breed', params.breed.toString());
    if (typeof params?.min_age_months === 'number') queryParams.append('min_age_months', String(params.min_age_months));
    if (typeof params?.max_age_months === 'number') queryParams.append('max_age_months', String(params.max_age_months));
    if (params?.ordering) queryParams.append('ordering', params.ordering);
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.page_size) queryParams.append('page_size', params.page_size.toString());
    if (typeof params?.user_lat === 'number') queryParams.append('user_lat', String(params.user_lat));
    if (typeof params?.user_lng === 'number') queryParams.append('user_lng', String(params.user_lng));

    const queryString = queryParams.toString();
    const endpoint = queryString ? `/pets/?${queryString}` : '/pets/';
    
    return this.request<PaginatedResponse<Pet>>(endpoint);
  }

  /**
   * Fetch all pets across all pages with the given filters.
   * Returns a flat list of Pet objects.
   */
  async getAllPets(params?: {
    search?: string;
    pet_type?: string;
    gender?: string;
    status?: string;
    exclude_status?: string;
    location?: string;
    min_price?: number;
    max_price?: number;
    min_age_months?: number;
    max_age_months?: number;
    breed?: number;
    ordering?: string;
    page_size?: number;
    user_lat?: number;
    user_lng?: number;
  }): Promise<ApiResponse<Pet[]>> {
    try {
      // Build initial path from params
      const queryParams = new URLSearchParams();
      if (params?.search) queryParams.append('search', params.search);
      if (params?.pet_type) queryParams.append('pet_type', params.pet_type);
      if (params?.gender) queryParams.append('gender', params.gender);
      if (params?.status) queryParams.append('status', params.status);
      if (params?.exclude_status) queryParams.append('exclude_status', params.exclude_status);
      if (params?.location) queryParams.append('location', params.location);
      if (params?.min_price) queryParams.append('min_price', String(params.min_price));
      if (params?.max_price) queryParams.append('max_price', String(params.max_price));
      if (typeof params?.min_age_months === 'number') queryParams.append('min_age_months', String(params.min_age_months));
      if (typeof params?.max_age_months === 'number') queryParams.append('max_age_months', String(params.max_age_months));
      if (params?.breed) queryParams.append('breed', String(params.breed));
      if (params?.ordering) queryParams.append('ordering', params.ordering);
      if (params?.page_size) queryParams.append('page_size', String(params.page_size));
      if (typeof params?.user_lat === 'number') queryParams.append('user_lat', String(params.user_lat));
      if (typeof params?.user_lng === 'number') queryParams.append('user_lng', String(params.user_lng));

      const initialPath = queryParams.toString() ? `/pets/?${queryParams.toString()}` : '/pets/';

      const allPets: Pet[] = [];
      let nextPath: string | null = initialPath;
      let pageCount = 0;
      const MAX_PAGES = 50; // safety limit

      while (nextPath && pageCount < MAX_PAGES) {
        pageCount += 1;
        const response = await this.request<PaginatedResponse<Pet>>(nextPath);
        if (!response.success || !response.data) {
          return { success: false, error: response.error || 'Failed to load pets' };
        }

        const pagePets = response.data.results || [];
        allPets.push(...pagePets);

        if (response.data.next) {
          nextPath = this.extractPathFromFullUrl(response.data.next);
        } else {
          nextPath = null;
        }
      }

      return { success: true, data: allPets };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to load all pets' };
    }
  }

  async getPetMapMarkers(params: {
    bbox: string;
    zoom: number;
    cluster?: boolean;
    limit_points?: number;
    user_lat?: number;
    user_lng?: number;
    status?: string;
    pet_type?: string;
    gender?: string;
    min_age_months?: number;
    max_age_months?: number;
    search?: string;
    exclude_status?: string;
  }): Promise<ApiResponse<MapMarkersResponse<PetMapPoint>>> {
    const queryParams = new URLSearchParams();
    queryParams.append('bbox', params.bbox);
    queryParams.append('zoom', String(params.zoom));
    queryParams.append('cluster', String(params.cluster ?? true));
    if (typeof params.limit_points === 'number') queryParams.append('limit_points', String(params.limit_points));
    if (typeof params.user_lat === 'number') queryParams.append('user_lat', String(params.user_lat));
    if (typeof params.user_lng === 'number') queryParams.append('user_lng', String(params.user_lng));
    if (params.status) queryParams.append('status', params.status);
    if (params.pet_type) queryParams.append('pet_type', params.pet_type);
    if (params.gender) queryParams.append('gender', params.gender);
    if (typeof params.min_age_months === 'number') queryParams.append('min_age_months', String(params.min_age_months));
    if (typeof params.max_age_months === 'number') queryParams.append('max_age_months', String(params.max_age_months));
    if (params.search) queryParams.append('search', params.search);
    if (params.exclude_status) queryParams.append('exclude_status', params.exclude_status);

    return this.request<MapMarkersResponse<PetMapPoint>>(`/pets/map/markers/?${queryParams.toString()}`);
  }

  async getPet(id: number): Promise<ApiResponse<Pet>> {
    return this.request<Pet>(`/pets/${id}/`);
  }

  async createPet(petData: FormData): Promise<ApiResponse<Pet>> {
    return this.request<Pet>('/pets/', {
      method: 'POST',
      body: petData,
    });
  }

  async updatePet(id: number, petData: FormData): Promise<ApiResponse<Pet>> {
    return this.request<Pet>(`/pets/${id}/`, {
      method: 'PUT',
      body: petData,
    });
  }

  async deletePet(id: number): Promise<ApiResponse<void>> {
    return this.request<void>(`/pets/${id}/`, {
      method: 'DELETE',
    });
  }

  async getMyPets(): Promise<ApiResponse<PaginatedResponse<Pet>>> {
    return this.request<PaginatedResponse<Pet>>('/pets/my/');
  }

  // User endpoints
  async getProfile(): Promise<ApiResponse<User>> {
    return this.request<User>('/accounts/profile/');
  }

  async updateProfile(userData: Partial<User>): Promise<ApiResponse<User>> {
    return this.request<User>('/accounts/profile/', {
      method: 'PATCH',
      body: JSON.stringify(userData),
    });
  }

  // Favorites endpoints
  async getFavorites(): Promise<ApiResponse<Pet[]>> {
    return this.request<Pet[]>('/pets/favorites/');
  }

  async toggleFavorite(petId: number): Promise<ApiResponse<{ is_favorite: boolean }>> {
    return this.request<{ is_favorite: boolean }>(`/pets/${petId}/toggle-favorite/`, {
      method: 'POST',
    });
  }

  // Breeding requests endpoints
  async getBreedingRequests(): Promise<ApiResponse<PaginatedResponse<any>>> {
    return this.request<PaginatedResponse<any>>('/pets/breeding-requests/');
  }

  async createBreedingRequest(requestData: any): Promise<ApiResponse<any>> {
    return this.request<any>('/pets/breeding-requests/', {
      method: 'POST',
      body: JSON.stringify(requestData),
    });
  }

  async getMyBreedingRequests(): Promise<ApiResponse<any[]>> {
    return this.request<any[]>('/pets/breeding-requests/my/');
  }

  async getReceivedBreedingRequests(): Promise<ApiResponse<any[]>> {
    return this.request<any[]>('/pets/breeding-requests/received/');
  }

  async respondToBreedingRequest(
    requestId: number,
    response: 'approve' | 'reject',
    message?: string
  ): Promise<ApiResponse<any>> {
    const payload: Record<string, any> = { response };
    if (message && response === 'reject') {
      payload.message = message;
    }
    return this.request<any>(`/pets/breeding-requests/${requestId}/respond/`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // Notifications endpoints
  async getNotifications(): Promise<ApiResponse<any[]>> {
    return this.request<any[]>('/pets/notifications/');
  }

  async getNotificationPreferences(): Promise<ApiResponse<any>> {
    return this.request<any>('/pets/notifications/preferences/');
  }

  async updateNotificationPreferencesV2(payload: Record<string, any>): Promise<ApiResponse<any>> {
    return this.request<any>('/pets/notifications/preferences/', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  async markNotificationAsRead(notificationId: number): Promise<ApiResponse<void>> {
    return this.request<void>(`/pets/notifications/${notificationId}/mark-read/`, {
      method: 'POST',
    });
  }

  async markAllNotificationsAsRead(): Promise<ApiResponse<void>> {
    return this.request<void>('/pets/notifications/mark-all-read/', {
      method: 'POST',
    });
  }

  async markChatNotificationsAsRead(chatId: string): Promise<ApiResponse<{ updated_count?: number }>> {
    return this.request<{ updated_count?: number }>('/pets/notifications/mark-chat-read/', {
      method: 'POST',
      body: JSON.stringify({ chat_id: chatId }),
    });
  }

  async getUnreadNotificationsCount(): Promise<ApiResponse<{ count: number }>> {
    return this.request<{ count: number }>('/pets/notifications/unread-count/');
  }

  async trackNotificationEvent(
    eventType: 'opened' | 'actioned' | 'dismissed',
    source: 'mobile_push' | 'web_push' | 'in_app',
    notificationId?: number,
    metadata?: Record<string, any>
  ): Promise<ApiResponse<any>> {
    const payload: Record<string, any> = {
      event_type: eventType,
      source,
      metadata: metadata || {},
    };
    if (typeof notificationId === 'number') {
      payload.notification_id = notificationId;
    }
    return this.request<any>('/pets/notifications/events/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getClinicInvites(status: 'pending' | 'accepted' | 'declined' | 'expired' | 'all' = 'pending'): Promise<ApiResponse<any[]>> {
    const query = status && status !== 'all' ? `?status=${status}` : '';
    return this.request<any[]>(`/clinics/invites/${query}`);
  }

  async respondToClinicInvite(token: string, action: 'accept' | 'decline'): Promise<ApiResponse<any>> {
    return this.request<any>(`/clinics/invites/${token}/${action}/`, {
      method: 'POST',
    });
  }

  // Veterinary clinics endpoints
  async getClinics(params?: { serviceCategory?: string; page?: number; pageSize?: number }): Promise<ApiResponse<Clinic[] | { results: Clinic[] }>> {
    const searchParams = new URLSearchParams();
    if (params?.serviceCategory) {
      searchParams.append('service_category', params.serviceCategory);
    }
    if (typeof params?.page === 'number') {
      searchParams.append('page', String(params.page));
    }
    if (typeof params?.pageSize === 'number') {
      searchParams.append('page_size', String(params.pageSize));
    }
    const query = searchParams.toString();
    return this.request<Clinic[] | { results: Clinic[] }>(
      `/clinics/clinic/${query ? `?${query}` : ''}`
    );
  }

  async getAllClinics(params?: { serviceCategory?: string; pageSize?: number }): Promise<ApiResponse<Clinic[]>> {
    try {
      const searchParams = new URLSearchParams();
      if (params?.serviceCategory) {
        searchParams.append('service_category', params.serviceCategory);
      }
      searchParams.append('page_size', String(params?.pageSize ?? 100));
      const initialPath = searchParams.toString()
        ? `/clinics/clinic/?${searchParams.toString()}`
        : '/clinics/clinic/';

      const allClinics: Clinic[] = [];
      let nextPath: string | null = initialPath;
      let pageCount = 0;
      const MAX_PAGES = 50;

      while (nextPath && pageCount < MAX_PAGES) {
        pageCount += 1;
        const response = await this.request<PaginatedResponse<Clinic>>(nextPath);
        if (!response.success || !response.data) {
          return { success: false, error: response.error || 'Failed to load clinics' };
        }

        const pageClinics = response.data.results || [];
        allClinics.push(...pageClinics);

        if (response.data.next) {
          nextPath = this.extractPathFromFullUrl(response.data.next);
        } else {
          nextPath = null;
        }
      }

      return { success: true, data: allClinics };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to load clinics' };
    }
  }

  async getClinicMapMarkers(params: {
    bbox: string;
    zoom: number;
    cluster?: boolean;
    limit_points?: number;
    user_lat?: number;
    user_lng?: number;
    service_category?: string;
    search?: string;
  }): Promise<ApiResponse<MapMarkersResponse<ClinicMapPoint>>> {
    const queryParams = new URLSearchParams();
    queryParams.append('bbox', params.bbox);
    queryParams.append('zoom', String(params.zoom));
    queryParams.append('cluster', String(params.cluster ?? true));
    if (typeof params.limit_points === 'number') queryParams.append('limit_points', String(params.limit_points));
    if (typeof params.user_lat === 'number') queryParams.append('user_lat', String(params.user_lat));
    if (typeof params.user_lng === 'number') queryParams.append('user_lng', String(params.user_lng));
    if (params.service_category) queryParams.append('service_category', params.service_category);
    if (params.search) queryParams.append('search', params.search);

    return this.request<MapMarkersResponse<ClinicMapPoint>>(`/clinics/map/markers/?${queryParams.toString()}`);
  }

  async mapsAutocomplete(params: {
    query: string;
    language?: 'ar' | 'en';
    sessionToken?: string;
  }): Promise<ApiResponse<MapsAutocompleteResponse>> {
    const payload: Record<string, string> = {
      query: params.query,
      language: params.language || 'ar',
    };
    if (params.sessionToken) {
      payload.session_token = params.sessionToken;
    }
    return this.request<MapsAutocompleteResponse>('/accounts/maps/autocomplete/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async mapsGeocodePlace(params: {
    placeId: string;
    language?: 'ar' | 'en';
  }): Promise<ApiResponse<MapsGeocodeResponse>> {
    return this.request<MapsGeocodeResponse>('/accounts/maps/geocode/', {
      method: 'POST',
      body: JSON.stringify({
        place_id: params.placeId,
        language: params.language || 'ar',
      }),
    });
  }

  async mapsReverseGeocode(params: {
    lat: number;
    lng: number;
    language?: 'ar' | 'en';
  }): Promise<ApiResponse<MapsGeocodeResponse>> {
    return this.request<MapsGeocodeResponse>('/accounts/maps/reverse-geocode/', {
      method: 'POST',
      body: JSON.stringify({
        lat: params.lat,
        lng: params.lng,
        language: params.language || 'ar',
      }),
    });
  }

  async getClinicStorefront(clinicId: number | string): Promise<ApiResponse<any>> {
    return this.request<any>(`/clinics/storefront/${clinicId}/`);
  }

  async createStorefrontOrder(
    clinicId: number | string,
    payload: {
      customer_name: string;
      customer_phone: string;
      customer_email?: string | null;
      delivery_address?: string | null;
      notes?: string | null;
      items: Array<{ product_id: number; quantity: number }>;
    }
  ): Promise<ApiResponse<any>> {
    return this.request<any>(`/clinics/storefront/${clinicId}/orders/`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async createStorefrontBooking(
    clinicId: number | string,
    payload: {
      service_id: number;
      customer_name: string;
      customer_phone: string;
      customer_email?: string | null;
      pet_name?: string | null;
      preferred_date?: string | null;
      preferred_time?: string | null;
      notes?: string | null;
    }
  ): Promise<ApiResponse<any>> {
    return this.request<any>(`/clinics/storefront/${clinicId}/bookings/`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // Stats endpoints
  async getPetStats(): Promise<ApiResponse<any>> {
    return this.request<any>('/pets/stats/');
  }

  // Chat API Methods
  async getChatRooms(): Promise<ApiResponse<{ results: ChatRoomList[]; count: number }>> {
    if (!CHAT_API_ENABLED) {
      return { success: false, error: 'Chat API disabled' };
    }
    return this.request<{ results: ChatRoomList[]; count: number }>('/pets/chat/rooms/');
  }

  async getArchivedChatRooms(): Promise<ApiResponse<{ results: ChatRoomList[]; count: number }>> {
    if (!CHAT_API_ENABLED) {
      return { success: false, error: 'Chat API disabled' };
    }
    return this.request<{ results: ChatRoomList[]; count: number }>('/pets/chat/rooms/archived/');
  }

  async getChatRoomByFirebaseId(firebaseChatId: string): Promise<ApiResponse<ChatRoom>> {
    if (!CHAT_API_ENABLED) {
      return { success: false, error: 'Chat API disabled' };
    }
    // Align with frontend/backend: chat endpoints are under /api/pets/chat/
    return this.request<ChatRoom>(`/pets/chat/firebase/${firebaseChatId}/`);
  }

  async getChatRoomByBreedingRequest(breedingRequestId: number): Promise<ApiResponse<ChatRoom | null>> {
    try {
      const response = await this.request<ChatRoom>(`/pets/chat/breeding-request/${breedingRequestId}/`);
      return response;
    } catch (error) {
      console.error('Error getting chat room by breeding request:', error);
      return { success: false, error: 'Failed to get chat room', data: null };
    }
  }

  async getChatRoomByAdoptionRequest(adoptionRequestId: number): Promise<ApiResponse<ChatRoom | null>> {
    try {
      const response = await this.request<ChatRoom>(`/pets/chat/adoption-request/${adoptionRequestId}/`);
      return response;
    } catch (error) {
      console.error('Error getting chat room by adoption request:', error);
      return { success: false, error: 'Failed to get chat room', data: null };
    }
  }

  async getChatRoomContext(chatId: number): Promise<ApiResponse<{ id: number; firebase_chat_id: string; chat_context: ChatContext }>> {
    if (!CHAT_API_ENABLED) {
      return { success: false, error: 'Chat API disabled' } as any;
    }
    return this.request<{ id: number; firebase_chat_id: string; chat_context: ChatContext }>(`/pets/chat/rooms/${chatId}/context/`);
  }

  async createChatRoom(breedingRequestId: number): Promise<ApiResponse<{
    chat_room: ChatRoom;
    context: ChatContext;
    message: string;
  }>> {
    return this.request<{
      chat_room: ChatRoom;
      context: ChatContext;
      message: string;
    }>(CHAT_API_ENABLED ? '/pets/chat/create/' : '/__disabled__', {
      method: 'POST',
      body: JSON.stringify({
        breeding_request_id: breedingRequestId
      }),
    });
  }

  async createAdoptionChatRoom(adoptionRequestId: number): Promise<ApiResponse<{
    chat_room: ChatRoom;
    context: ChatContext;
    message: string;
  }>> {
    return this.request<{
      chat_room: ChatRoom;
      context: ChatContext;
      message: string;
    }>(CHAT_API_ENABLED ? '/pets/chat/create/' : '/__disabled__', {
      method: 'POST',
      body: JSON.stringify({
        adoption_request_id: adoptionRequestId,
      }),
    });
  }

  async archiveChatRoom(chatId: number): Promise<ApiResponse<{ message: string }>> {
    if (!CHAT_API_ENABLED) {
      return { success: false, error: 'Chat API disabled' };
    }
    return this.request<{ message: string }>(`/pets/chat/rooms/${chatId}/archive/`, {
      method: 'POST'
    });
  }

  async reactivateChatRoom(chatId: number): Promise<ApiResponse<{
    message: string;
    chat_room: ChatRoom;
  }>> {
    if (!CHAT_API_ENABLED) {
      return { success: false, error: 'Chat API disabled' } as any;
    }
    return this.request<{
      message: string;
      chat_room: ChatRoom;
    }>(`/pets/chat/rooms/${chatId}/reactivate/`, {
      method: 'POST'
    });
  }

  async getChatRoomStatus(chatId: number): Promise<ApiResponse<ChatStatus>> {
    if (!CHAT_API_ENABLED) {
      return { success: false, error: 'Chat API disabled' } as any;
    }
    return this.request<ChatStatus>(`/pets/chat/rooms/${chatId}/status/`);
  }

  async getUserChatStatus(): Promise<ApiResponse<UserChatStatus>> {
    if (!CHAT_API_ENABLED) {
      return { success: false, error: 'Chat API disabled' } as any;
    }
    return this.request<UserChatStatus>('/pets/chat/user-status/');
  }

  async sendChatMessageNotification(firebaseChatId: string, message: string): Promise<ApiResponse<{ message: string }>> {
    if (!CHAT_API_ENABLED) {
      return { success: false, error: 'Chat API disabled' } as any;
    }
    return this.request<{ message: string }>('/pets/notifications/chat-message/', {
      method: 'POST',
      body: JSON.stringify({
        chat_id: firebaseChatId,
        message,
      }),
    });
  }

  async uploadChatImage(imageFile: any): Promise<ApiResponse<{ image_url: string; filename: string }>> {
    if (!CHAT_API_ENABLED) {
      return { success: false, error: 'Chat API disabled' } as any;
    }
    try {
      const formData = new FormData();
      // Normalize RN file object: ensure uri/name/type present
      if (imageFile && typeof imageFile === 'object' && 'uri' in imageFile) {
        let uri: string = imageFile.uri as string;
        // iOS sometimes requires stripping file:// prefix
        if (Platform.OS === 'ios' && uri.startsWith('file://')) {
          uri = uri.replace('file://', '');
        }
        const filePart: any = {
          uri,
          name: imageFile.name || `chat_${Date.now()}.jpg`,
          type: imageFile.type || 'image/jpeg',
        };
        formData.append('image', filePart);
      } else {
        formData.append('image', imageFile as any);
      }
      
      const response = await fetch(`${BASE_URL}/pets/chat/upload-image/`, {
        method: 'POST',
        body: formData,
        headers: {
          ...(await this.getAuthHeaders()),
          Accept: 'application/json',
          // Don't set Content-Type for FormData, let the browser set it
        },
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Upload failed:', response.status, errorText);
        throw new Error(`Upload failed: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.image_url) {
        result.image_url = resolveMediaUrl(result.image_url, result.image_url);
      }
      
      return { success: true, data: result };
    } catch (error) {
      console.error('Error uploading chat image:', error);
      return { success: false, error: 'Failed to upload image', data: undefined };
    }
  }

  // Adoption endpoints
  async getAdoptionPets(): Promise<ApiResponse<Pet[]>> {
    return this.request<Pet[]>('/pets/adoption/pets/');
  }

  // Breeding notifications (optional; backend must implement)
  async notifyBreedingEvent(event: 'requested' | 'accepted' | 'rejected', payload: any): Promise<ApiResponse<{ message: string }>> {
    try {
      return await this.request<{ message: string }>(`/pets/breeding/notify/`, {
        method: 'POST',
        body: JSON.stringify({ event, ...payload }),
      });
    } catch (error) {
      return { success: false, error: 'notifyBreedingEvent failed' };
    }
  }

  async createAdoptionRequest(requestData: any): Promise<ApiResponse<any>> {
    // NOTE: The backend requires users to be verified before submitting adoption requests.
    // Before calling this method, check if user.is_verified is true.
    // If not verified, direct the user to complete verification first via VerificationScreen.
    // The backend will return a 403 error with verification_required: true if user is not verified.
    return this.request<any>('/pets/adoption/', {
      method: 'POST',
      body: JSON.stringify(requestData),
    });
  }

  async getMyAdoptionRequests(): Promise<ApiResponse<any[]>> {
    const response = await this.request<any>('/pets/adoption/my/');
    if (response.success && response.data) {
      // Handle paginated response
      const results = response.data.results || response.data;
      return {
        success: true,
        data: Array.isArray(results) ? results : []
      };
    }
    return response;
  }

  async getReceivedAdoptionRequests(): Promise<ApiResponse<any[]>> {
    const response = await this.request<any>('/pets/adoption/received/');
    if (response.success && response.data) {
      // Handle paginated response
      const results = response.data.results || response.data;
      return {
        success: true,
        data: Array.isArray(results) ? results : []
      };
    }
    return response;
  }

  async respondToAdoptionRequest(
    requestId: number,
    action: 'approve' | 'reject' | 'complete',
    notes?: string,
    adminNotes?: string
  ): Promise<ApiResponse<any>> {
    return this.request<any>(`/pets/adoption/${requestId}/respond/`, {
      method: 'POST',
      body: JSON.stringify({
        action,
        ...(notes !== undefined ? { notes } : {}),
        ...(adminNotes !== undefined ? { admin_notes: adminNotes } : {}),
      }),
    });
  }

  async getAdoptionStats(): Promise<ApiResponse<any>> {
    return this.request<any>('/pets/adoption/stats/');
  }

  // User profile endpoints
  async getUserProfile(): Promise<ApiResponse<User>> {
    return this.request<User>('/accounts/profile/');
  }

  async getUserPets(): Promise<ApiResponse<Pet[]>> {
    return this.request<Pet[]>('/pets/my/');
  }

  // Account management
  async updateUserProfile(data: Partial<User> & { password?: string; phone?: string }): Promise<ApiResponse<User>> {
    return this.request<User>('/accounts/profile/', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async updateNotificationPreferences(
    notifyBreedingRequests: boolean,
    notifyAdoptionPets: boolean
  ): Promise<ApiResponse<User>> {
    return this.request<User>('/accounts/profile/', {
      method: 'PATCH',
      body: JSON.stringify({
        notify_breeding_requests: notifyBreedingRequests,
        notify_adoption_pets: notifyAdoptionPets,
      }),
    });
  }

  async deleteAccount(): Promise<ApiResponse<{ message: string }>> {
    const attempt = await this.request<{ message: string }>('/accounts/profile/', { method: 'DELETE' });
    if (attempt.success) return attempt;
    return this.request<{ message: string }>('/accounts/delete/', { method: 'POST' });
  }

  async updatePetLocationIfNeeded(petId: number, currentLocation: string | undefined | null, resolvedAddress: string): Promise<void> {
    try {
      const looksLikeCoords = (s: string | undefined | null) => !!s && /^\s*-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?\s*$/.test(s);
      if (!resolvedAddress || resolvedAddress.trim().length < 3) return;
      if (currentLocation && !looksLikeCoords(currentLocation)) return; // already human-readable
      await this.request(`/pets/${petId}/`, {
        method: 'PATCH',
        body: JSON.stringify({ location: resolvedAddress }),
      });
    } catch {
      // best-effort; ignore errors
    }
  }

  // Account Verification endpoints
  async submitVerification(idPhoto: any, selfieVideo: any): Promise<ApiResponse<{ success: boolean; message: string; verification: AccountVerification }>> {
    try {
      const formData = new FormData();
      
      // Add ID photo
      if (idPhoto && typeof idPhoto === 'object' && 'uri' in idPhoto) {
        const idPhotoPart: any = {
          uri: idPhoto.uri,
          name: idPhoto.name || `id_photo_${Date.now()}.jpg`,
          type: idPhoto.type || 'image/jpeg',
        };
        formData.append('id_photo', idPhotoPart);
      }
      
      // Add selfie video
      if (selfieVideo && typeof selfieVideo === 'object' && 'uri' in selfieVideo) {
        const videoPart: any = {
          uri: selfieVideo.uri,
          name: selfieVideo.name || `selfie_video_${Date.now()}.mp4`,
          type: selfieVideo.type || 'video/mp4',
        };
        formData.append('selfie_video', videoPart);
      }
      
      const response = await fetch(`${BASE_URL}/accounts/verification/request/`, {
        method: 'POST',
        body: formData,
        headers: {
          ...(await this.getAuthHeaders()),
          Accept: 'application/json',
          // Don't set Content-Type for FormData
        },
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Verification submission failed:', response.status, errorText);
        return {
          success: false,
          error: `فشل إرسال طلب التحقق: ${response.status}`,
        };
      }
      
      const result = await response.json();
      return { success: true, data: result };
    } catch (error) {
      console.error('Error submitting verification:', error);
      return { 
        success: false, 
        error: 'حدث خطأ أثناء إرسال طلب التحقق'
      };
    }
  }

  async getVerificationStatus(): Promise<ApiResponse<VerificationStatus>> {
    return this.request<VerificationStatus>('/accounts/verification/status/');
  }
}

export const apiService = new ApiService();
