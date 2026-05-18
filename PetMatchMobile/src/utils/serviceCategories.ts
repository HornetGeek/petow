// Single source of truth for clinic service categories. Previously these were
// duplicated in ClinicsScreen, ClinicDetailsScreen, and PetMapScreen.

export type ServiceCategoryKey =
  | 'general'
  | 'vaccination'
  | 'surgery'
  | 'grooming'
  | 'dental'
  | 'breeding'
  | 'boarding'
  | 'emergency'
  | 'diagnostic'
  | 'prescription'
  | 'other';

export const SERVICE_CATEGORY_LABELS: Record<ServiceCategoryKey, string> = {
  general: 'فحص عام',
  vaccination: 'تطعيم',
  surgery: 'جراحة',
  grooming: 'تنظيف وتجميل',
  dental: 'عناية الأسنان',
  breeding: 'استشارات تزاوج',
  boarding: 'إقامة ورعاية',
  emergency: 'طوارئ',
  diagnostic: 'فحوصات تشخيصية',
  prescription: 'وصفات طبية',
  other: 'خدمات أخرى',
};

// Categories surfaced on the home strip. Subset of the full set, ordered by
// expected user demand.
export const HOME_FEATURED_CATEGORIES: ServiceCategoryKey[] = [
  'vaccination',
  'grooming',
  'dental',
  'surgery',
  'boarding',
  'emergency',
];

// Emoji used in the home category tiles. Plain emoji keeps the home light —
// no extra icon assets required.
export const SERVICE_CATEGORY_EMOJI: Record<ServiceCategoryKey, string> = {
  general: '🩺',
  vaccination: '💉',
  surgery: '🏥',
  grooming: '✂️',
  dental: '🦷',
  breeding: '🐾',
  boarding: '🏠',
  emergency: '🚨',
  diagnostic: '🔬',
  prescription: '💊',
  other: '✨',
};

export const mapServiceCategoryLabel = (value: string): string => {
  const trimmed = value.trim() as ServiceCategoryKey;
  return SERVICE_CATEGORY_LABELS[trimmed] || value;
};
