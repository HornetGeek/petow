// Translates the enum-style values we receive on adoption requests into
// the Arabic labels the user filled out in the form. The backend stores
// machine-friendly slugs (apartment, basic, high) but the form UI in
// AdoptionRequestScreen presents Arabic labels — we mirror those here so
// the pinned RequestSystemCard reads naturally.

export const housingTypeLabel = (raw: string | undefined): string | undefined => {
  if (!raw) return undefined;
  switch (raw) {
    case 'apartment': return 'شقة';
    case 'house': return 'منزل';
    case 'villa': return 'فيلا';
    case 'farm': return 'مزرعة';
    case 'other': return 'أخرى';
    default: return raw;
  }
};

export const experienceLevelLabel = (raw: string | undefined): string | undefined => {
  if (!raw) return undefined;
  switch (raw) {
    case 'none': return 'لا يوجد';
    case 'basic': return 'مبتدئ';
    case 'intermediate': return 'متوسط';
    case 'expert': return 'متمرس';
    case 'advanced': return 'متقدم';
    default: return raw;
  }
};

export const timeAvailabilityLabel = (raw: string | undefined): string | undefined => {
  if (!raw) return undefined;
  switch (raw) {
    case 'low': return 'قليل';
    case 'medium': return 'متوسط';
    case 'high': return 'كثير';
    default: return raw;
  }
};

export const feePaidByLabel = (raw: string | undefined): string | undefined => {
  if (!raw) return undefined;
  switch (raw) {
    case 'requester': return 'الطالب';
    case 'receiver': return 'المالك الآخر';
    case 'split': return 'مناصفة';
    default: return raw;
  }
};

export const yesNoLabel = (raw: boolean | undefined): string | undefined => {
  if (raw === undefined || raw === null) return undefined;
  return raw ? 'نعم' : 'لا';
};

export const formatMeetingDate = (iso: string | undefined): string | undefined => {
  if (!iso) return undefined;
  // ISO date (YYYY-MM-DD) — format as DD/MM/YYYY for the Arabic-RTL reader.
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};
