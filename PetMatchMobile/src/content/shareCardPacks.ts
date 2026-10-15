// Creative packs for share cards
// Each pack contains gender-aware title/subtitle templates, optional badges and ctas

export type CardType = 'adoption' | 'breeding';
export type Gender = 'M' | 'F';

export interface GenderText {
  male: string;
  female: string;
}

export interface CreativePack {
  key: string;
  label: string;
  allow: CardType[]; // which card types this pack suits
  title?: GenderText[]; // main headline candidates
  subtitle?: GenderText[]; // secondary line
  badges?: string[]; // tiny badges below title
  cta?: string[]; // call to action one-liners
}

// Helper to build GT easily
const GT = (male: string, female?: string): GenderText => ({ male, female: female ?? male });

export const creativePacks: CreativePack[] = [
  // Wordplay / قوافي وتلاعب
  {
    key: 'wordplay',
    label: 'لعب بالكلمات',
    allow: ['adoption', 'breeding'],
    title: [
      GT('مواء.. لقاء.. وبعدين وفاء.', 'مواء.. لقاء.. وبعدين وفاء.'),
      GT('قلبي حصري… حبي قصري.', 'قلبي حصري… حبي قصري.'),
      GT('أنا مش كيوت… أنا كيوتيفورس!', 'أنا مش كيوت… أنا كيوتيفورس!'),
      GT('خرّخرة ترند… وحُب ما بينتهيش Weekend.', 'خرّخرة ترند… وحُب ما بينتهيش Weekend.'),
    ],
    subtitle: [
      GT('تونة × حضن = معادلة سِرّيّة للسعادة.', 'تونة × حضن = معادلة سِرّيّة للسعادة.'),
    ],
    cta: ['كلّمني على واتساب—ابعت كلمة مواء.', 'امسح الـQR وشوف الفيديو القصير.'],
  },

  // Chat / محادثة واتساب
  {
    key: 'chat',
    label: 'محادثة',
    allow: ['adoption', 'breeding'],
    title: [
      GT('— هدفك من الجواز؟\n— سكواد مواء مكوّن من ٤.', '— هدفِك من الجواز؟\n— سكواد مواء مكوّن من ٤.'),
      GT('— جاهز للمقابلة؟\n— لو في كشف قبل الجواز… حاضر ✅', '— جاهزة للمقابلة؟\n— لو في كشف قبل الجواز… حاضر ✅'),
      GT('— تبنّيني؟\n— أتَبنّى قلبك كمان 💛', '— تبنّيني؟\n— أتَبنّى قلبِك كمان 💛'),
    ],
    cta: ['احجز مقابلة تعارف في دقيقتين.', 'كلّمني على واتساب—ابعت كلمة مواء.'],
    badges: ['لقاء تعارف متاح 📞'],
  },

  // Dating vibe
  {
    key: 'dating',
    label: 'مواعدة',
    allow: ['adoption', 'breeding'],
    title: [
      GT('الاهتمامات: شمس، بلكونة، وتونة… وشريك مسؤول.', 'الاهتمامات: شمس، بلكونة، وتونة… وشريك مسؤول.'),
      GT('No Drama — Yes خرّخرة.', 'No Drama — Yes خرّخـرا.'),
    ],
    subtitle: [
      GT('أبحث عن شريك/ة نكوّن بيت دافي ونشارك الليتر بودكاست!', 'أبحث عن شريك/ة نكوّن بيت دافي ونشارك الليتر بودكاست!'),
    ],
    badges: ['تزاوج مسؤول 💉'],
  },

  // Sports / رياضي
  {
    key: 'sports',
    label: 'رياضة',
    allow: ['adoption', 'breeding'],
    title: [
      GT('خطة اللعب: 4–4–مواء… والبطولة قلبك.', 'خطة اللعب: 4–4–مواء… والبطولة قلبك.'),
      GT('محتاج مهاجم يطارد الليزر، ودفاع يحمي السناكس.', 'محتاجة مهاجم يطارد الليزر، ودفاع يحمي السناكس.'),
    ],
    subtitle: [GT('هدف المباراة: بيت صفر مشاكل.', 'هدف المباراة: بيت صفر مشاكل.')],
  },

  // Cinema / Pop-culture
  {
    key: 'cinema',
    label: 'سينما',
    allow: ['adoption', 'breeding'],
    title: [
      GT('“حكاية حب على نغمة مواء” — البطولة: {name}.', '“حكاية حب على نغمة مواء” — البطولة: {name}.'),
      GT('Next Episode: "اللقاء الأول"… بعد كشف البيطري.', 'Next Episode: "اللقاء الأول"… بعد كشف البيطري.'),
      GT('Marvel مواء: Catvengers — Assemble!', 'Marvel مواء: Catvengers — Assemble!'),
    ],
  },

  // Royal / أميرات
  {
    key: 'royal',
    label: 'ملكي',
    allow: ['adoption', 'breeding'],
    title: [
      GT('أنا أميرة… بس محتاجة قصر وفحص قبل الزفاف.', 'أنا أميرة… بس محتاجة قصر وفحص قبل الزفاف.'),
      GT('التاج جاهز… فاضل شريك نمشي على الـRed Carpet.', 'التاج جاهز… فاضل شريك نمشي على الـRed Carpet.'),
    ],
    subtitle: [GT('شروط البلاط: حب + أدب + ليتر بوكس لامع.', 'شروط البلاط: حب + أدب + ليتر بوكس لامع.')],
  },

  // Tech / تقني
  {
    key: 'tech',
    label: 'تقني',
    allow: ['adoption', 'breeding'],
    title: [
      GT('Battery: 100% حب — 0% غضب.', 'Battery: 100% حب — 0% غضب.'),
      GT('AirDrop مشاعر… وQR للواتساب جاهز.', 'AirDrop مشاعر… وQR للواتساب جاهز.'),
      GT('أنا نسخة Premium: مطعّم + خرّخرة Dolby.', 'أنا نسخة Premium: مطعّمة + خرّخرة Dolby.'),
    ],
    cta: ['امسح الـQR وشوف الفيديو القصير.'],
  },

  // Poetry / شعر
  {
    key: 'poetry',
    label: 'شِعر',
    allow: ['adoption', 'breeding'],
    title: [
      GT('يا بيت فيك شباك… خُد قلبي وارتاح.', 'يا بيت فيك شباك… خدي قلبي وارتاحي.'),
      GT('حضنك وطن… وأنا مواطن خرّخاب.', 'حضنك وطن… وأنا مواطنة خرّخابة.'),
      GT('بابك أمان… وموائي عنوان.', 'بابك أمان… وموائي عنوان.'),
    ],
  },

  // Foodie / أكل
  {
    key: 'foodie',
    label: 'Foodie',
    allow: ['adoption', 'breeding'],
    title: [
      GT('المَهر: علبة تونة + كشف بيطري… وسنّاك بعدين.', 'المَهر: علبة تونة + كشف بيطري… وسنّاك بعدين.'),
      GT('لو مطبخك كريم… أنا هبقى رحيم (مع البسكوت بس!).', 'لو مطبخك كريم… أنا هبقى رحيمة (مع البسكوت بس!).'),
      GT('سيب لي زاوية جنب الفرن… وأنا أسيب لك قلبي.', 'سيبي لي زاوية جنب الفرن… وأنا أسيب لك قلبي.'),
    ],
  },

  // Jobs / وظايف
  {
    key: 'jobs',
    label: 'وظايف',
    allow: ['adoption', 'breeding'],
    title: [
      GT('المسمّى الوظيفي: Chief Purr Officer.', 'المسمّى الوظيفي: Chief Purr Officer.'),
      GT('المهام: ترفيه + حماية السناكس + إنذار قبل المطر.', 'المهام: ترفيه + حماية السناكس + إنذار قبل المطر.'),
      GT('المهارة: Snooze مع خرّخرة إيقاعية.', 'المهارة: Snooze مع خرّخرة إيقاعية.'),
    ],
  },

  // One-liners / لمّاع
  {
    key: 'oneliners',
    label: 'ون-لاينر',
    allow: ['adoption', 'breeding'],
    title: [
      GT('جاهز للارتباط… مع تحليل قبل الجواز.', 'جاهزة للارتباط… مع تحليل قبل الجواز.'),
      GT('قلبي حصري… والباقي نتفاهم عليه.', 'قلبي حصري… والباقي نتفاهم عليه.'),
      GT('بيت دافي = خرّخرة مدى الحياة.', 'بيت دافي = خرّخرة مدى الحياة.'),
      GT('أنا سبب ضحكتك اليومية.', 'أنا سبب ضحكتك اليومية.'),
      GT('تعالا نجرّب قعدة بلكونة ونحكم.', 'تعالي نجرّب قعدة بلكونة ونحكم.'),
      GT('مش جعان أكل… جعان جرعة حُب!', 'مش جعانة أكل… جعانة جرعة حُب!'),
      GT('Team “No-Show” ممنوع—أنا punctual في الحضن.', 'Team “No-Show” ممنوع—أنا punctual في الحضن.'),
    ],
  },

  // Squad of 4 / ٤ مساعدين
  {
    key: 'squad4',
    label: 'سكواد 4',
    allow: ['breeding', 'adoption'],
    title: [
      GT('عايز أجيب سكواد مواء: ليزر/حارس تونة/واثنين يشجّعوني!', 'عايزة أجيب سكواد مواء: ليزر/حارس تونة/واثنين يشجّعوني!'),
      GT('مشروع عيلة: ٤ مساعدين جري ضد المقشة.', 'مشروع عيلة: ٤ مساعدين جري ضد المقشة.'),
    ],
  },

  // Adoption alternatives / تبنّي
  {
    key: 'adoptionAlt',
    label: 'تبنّي',
    allow: ['adoption'],
    title: [
      GT('تبنّاني… وأنا أتَبَنّى روتين سعادتك.', 'تبنّيني… وأنا أتَبَنّى روتين سعادتك.'),
      GT('أنا مش ضيف—أنا أصغر فرد في العيلة.', 'أنا مش ضيفة—أنا أصغر فرد في العيلة.'),
      GT('أعدك: أول ما أدخل بيتك… البيت يبقى بيتين.', 'أعدكِ: أول ما أدخل بيتك… البيت يبقى بيتين.'),
    ],
    badges: ['جاهز للتبنّي ✅'],
    cta: ['كلّمني على واتساب—ابعت كلمة مواء.'],
  },
];

export type CreativeThemeKey = typeof creativePacks[number]['key'];



