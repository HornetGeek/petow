// Funny phrases for pet share cards
// جمل مضحكة لكروت مشاركة الحيوانات

export interface FunnyPhrase {
  male: string;    // النص للذكر
  female: string;  // النص للأنثى
  type: 'adoption' | 'breeding' | 'both';
}

export const funnyPhrases: FunnyPhrase[] = [
  // Adoption phrases (تبني)
  { male: 'هات شباك وشمس… وخد قلب 💛', female: 'هات شباك وشمس… وخدي قلب 💛', type: 'adoption' },
  { male: 'بيت دافي مقابل خرّخرة 😻', female: 'بيت دافي مقابل خرّخرة 😻', type: 'adoption' },
  { male: 'أنا مش ضيف… أنا العيلة 🏠', female: 'أنا مش ضيفة… أنا العيلة 🏠', type: 'adoption' },
  { male: 'عندي خبرة: أحبّك بلا شروط ❤️', female: 'عندي خبرة: أحبّك بلا شروط ❤️', type: 'adoption' },
  { male: 'كل يوم حكاية… ومواء 📖', female: 'كل يوم حكاية… ومواء 📖', type: 'adoption' },
  { male: 'تعالَ نجرب قعدة بلكونة ونحكم 🌅', female: 'تعالي نجرب قعدة بلكونة ونحكم 🌅', type: 'adoption' },
  { male: 'حضن طويل؟ أنا جاهز 🤗', female: 'حضن طويل؟ أنا جاهزة 🤗', type: 'adoption' },
  { male: 'قلّة نومك… مسؤول عنها كيوتنس 😴', female: 'قلّة نومك… مسؤولة عنها كيوتنس 😴', type: 'adoption' },
  { male: 'بوسة ومياو… والباقي يتفاهم 😽', female: 'بوسة ومياو… والباقي يتفاهم 😽', type: 'adoption' },
  { male: 'أنا الجيفت اللي ما بيتلفش 🎁', female: 'أنا الجيفت اللي ما بيتلفش 🎁', type: 'adoption' },
  { male: 'مش جعان أكل… جعان حُب! 💕', female: 'مش جعانة أكل… جعانة حُب! 💕', type: 'adoption' },
  
  // Breeding phrases (تزاوج)
  { male: 'تزاوج مسؤول (لطيف وواضح) 💞', female: 'تزاوج مسؤول (لطيفة وواضحة) 💞', type: 'breeding' },
  { male: 'المَهر: علبة تونة + كشف بيطري 🐟', female: 'المَهر: علبة تونة + كشف بيطري 🐟', type: 'breeding' },
  { male: 'خرّخار رومانسي معتمد 💌', female: 'خرّخارة رومانسية معتمدة 💌', type: 'breeding' },
  { male: 'جاهز للارتباط… مع تحليل قبل الجواز 💍', female: 'جاهزة للارتباط… مع تحليل قبل الجواز 💍', type: 'breeding' },
  { male: 'ندور على شريكة يشاركني الـCatnip 🌿', female: 'ندور على شريك يشاركني الـCatnip 🌿', type: 'breeding' },
  { male: 'مؤدّب، مطعّم، والليتر بوكس تمام ✅', female: 'مؤدّبة، مطعّمة، والليتر بوكس تمام ✅', type: 'breeding' },
  { male: 'مقابلة تعارف… وبعدها قرار الأهل 👨‍👩‍👧‍👦', female: 'مقابلة تعارف… وبعدها قرار الأهل 👨‍👩‍👧‍👦', type: 'breeding' },
  { male: 'حب مسؤول = فحوصات قبل وبعد 🏥', female: 'حب مسؤول = فحوصات قبل وبعد 🏥', type: 'breeding' },
  { male: 'قلبي حصري… الليتر بوكس ممكن نتفاهم عليه 😸', female: 'قلبي حصري… الليتر بوكس ممكن نتفاهم عليه 😸', type: 'breeding' },
  { male: 'لو مواءك موزون… قلبي على مقام سي 🎵', female: 'لو مواءك موزون… قلبي على مقام سي 🎵', type: 'breeding' },
  { male: 'جاهز للنَطّ… وجاهز للحُب 💝', female: 'جاهزة للنَطّ… وجاهزة للحُب 💝', type: 'breeding' },
  { male: 'محترف "مواء" وقت اللزوم فقط 🔊', female: 'محترفة "مواء" وقت اللزوم فقط 🔊', type: 'breeding' },
  
  // Both (للتبني والتزاوج)
  { male: 'أنا مش عادي… أنا استثنائي! ⭐', female: 'أنا مش عادية… أنا استثنائية! ⭐', type: 'both' },
  { male: 'شكلي حلو ونسبي أحلى! 😻', female: 'شكلي حلو ونسبي أحلى! 😻', type: 'both' },
  { male: 'صحتي ممتازة وأوراقي كاملة! 📄', female: 'صحتي ممتازة وأوراقي كاملة! 📄', type: 'both' },
  { male: 'طبعي حلو وشكلي أحلى! 😊', female: 'طبعي حلو وشكلي أحلى! 😊', type: 'both' },
  { male: 'أنا الفرصة اللي مش هتتعوض! ⏰', female: 'أنا الفرصة اللي مش هتتعوض! ⏰', type: 'both' },
  { male: 'الجمال والذكاء في قط واحد! 🎓', female: 'الجمال والذكاء في قطة واحدة! 🎓', type: 'both' },
  { male: 'لو الكمال قط… هكون أنا! 👌', female: 'لو الكمال قطة… هكون أنا! 👌', type: 'both' },
  { male: 'فرصة العمر… متضيعهاش! 🎁', female: 'فرصة العمر… متضيعيهاش! 🎁', type: 'both' },
  { male: 'مستني المكالمة دي من زمان! 📞', female: 'مستنية المكالمة دي من زمان! 📞', type: 'both' },
  { male: 'حظكم السعيد وصل! 🍀', female: 'حظكم السعيد وصل! 🍀', type: 'both' },
  { male: 'أنا اللي كنتوا بتدوروا عليه! 🎯', female: 'أنا اللي كنتوا بتدوروا عليها! 🎯', type: 'both' },
  { male: 'لو الدنيا قطط… أنا ملكهم! 👑', female: 'لو الدنيا قطط… أنا ملكتهم! 👑', type: 'both' },
  { male: 'يا نهار! أنا فعلاً جميل أوي! 🤩', female: 'يا نهار! أنا فعلاً جميلة أوي! 🤩', type: 'both' },
  { male: 'كلّمني على واتساب 📱', female: 'كلّميني على واتساب 📱', type: 'both' },
  { male: 'اسألني عن التطعيمات والتفاصيل 💉', female: 'اسأليني عن التطعيمات والتفاصيل 💉', type: 'both' },
];

/**
 * Get a random funny phrase based on card type and gender
 */
export const getRandomPhrase = (
  cardType: 'adoption' | 'breeding',
  gender?: 'M' | 'F'
): string => {
  const validPhrases = funnyPhrases.filter(
    phrase => phrase.type === cardType || phrase.type === 'both'
  );
  
  const randomIndex = Math.floor(Math.random() * validPhrases.length);
  const selectedPhrase = validPhrases[randomIndex];
  
  // Return gender-specific text, default to male if gender not specified
  return gender === 'F' ? selectedPhrase.female : selectedPhrase.male;
};

/**
 * Get all phrases for a specific type and gender
 */
export const getPhrasesByType = (
  cardType: 'adoption' | 'breeding',
  gender?: 'M' | 'F'
): string[] => {
  return funnyPhrases
    .filter(phrase => phrase.type === cardType || phrase.type === 'both')
    .map(phrase => gender === 'F' ? phrase.female : phrase.male);
};

