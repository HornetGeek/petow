import { creativePacks, CreativeThemeKey, CardType, Gender, GenderText } from '../content/shareCardPacks';

export interface TextContext {
  name?: string | null;
  age?: string | null;
  area?: string | null;
  gender?: Gender;
  cardType: CardType;
}

export interface GeneratedCardText {
  title: string;
  subtitle?: string;
  badges: string[];
  ctas: string[];
  theme: CreativeThemeKey;
}

const pick = <T>(arr: T[], seed?: number): T => {
  if (!arr || arr.length === 0) throw new Error('pick() on empty array');
  if (typeof seed === 'number') {
    const idx = Math.abs(Math.floor(seed)) % arr.length;
    return arr[idx];
  }
  const idx = Math.floor(Math.random() * arr.length);
  return arr[idx];
};

const renderGenderText = (gt: GenderText, gender?: Gender): string => {
  return gender === 'F' ? gt.female : gt.male;
};

const renderPlaceholders = (s: string, ctx: TextContext): string => {
  return (s || '')
    .replace(/\{name\}/g, ctx.name || '')
    .replace(/\{age\}/g, ctx.age || '')
    .replace(/\{area\}/g, ctx.area || '');
};

export const getAvailableThemes = (cardType: CardType): CreativeThemeKey[] => {
  return creativePacks.filter(p => p.allow.includes(cardType)).map(p => p.key as CreativeThemeKey);
};

const selectPack = (theme: CreativeThemeKey | 'auto' | undefined, cardType: CardType): typeof creativePacks[number] => {
  const allowed = creativePacks.filter(p => p.allow.includes(cardType));
  if (!allowed.length) return creativePacks[0];
  if (!theme || theme === 'auto') return pick(allowed);
  return allowed.find(p => p.key === theme) || pick(allowed);
};

export function generateCardText(
  params: {
    cardType: CardType;
    gender?: Gender;
    name?: string | null;
    age?: string | null;
    area?: string | null;
    theme?: CreativeThemeKey | 'auto';
    seed?: number;
  }
): GeneratedCardText {
  const { cardType, gender, name, age, area, theme, seed } = params;
  const ctx: TextContext = { cardType, gender, name: name || undefined, age: age || undefined, area: area || undefined };
  const pack = selectPack(theme, cardType);

  const titleTmpl = pack.title && pack.title.length ? pick(pack.title, seed) : { male: '', female: '' };
  const subTmpl = pack.subtitle && pack.subtitle.length ? pick(pack.subtitle, seed ? seed + 1 : undefined) : undefined;

  const title = renderPlaceholders(renderGenderText(titleTmpl, gender), ctx).trim();
  const subtitle = subTmpl ? renderPlaceholders(renderGenderText(subTmpl, gender), ctx).trim() : undefined;

  const badges = (pack.badges || []).slice(0, 3);
  const ctas = (pack.cta || []).slice(0, 2);

  return {
    title: title || '',
    subtitle,
    badges,
    ctas,
    theme: pack.key as CreativeThemeKey,
  };
}



