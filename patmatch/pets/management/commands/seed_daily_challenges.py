from django.core.management.base import BaseCommand
from pets.models import DailyChallenge

PROMPTS = [
    ('aghrab-nawma', 'أغرب نومة 😹', 'ورّينا حيوانك وهو نايم في وضعية مستحيلة!'),
    ('malek-elbeit', 'ملك البيت 👑', 'مين الحيوان اللي بيتعامل كأنه صاحب الشقة؟'),
    ('azraf-nazra', 'أظرف نظرة 🥹', 'الصورة اللي مستحيل تقول بعدها لأ!'),
    ('etafash', 'اتقفش متلبس 😂', 'ورّينا موقف مضحك لحيوانك من غير ما تضايقه.'),
    ('awel-yom', 'صورة أول يوم 🐾', 'فاكر أول صورة لحيوانك لما جه البيت؟'),
    ('ebtesama', 'أحلى ابتسامة 😁', 'مين عنده الصورة الأكثر بهجة؟'),
    ('eiloula', 'قبل وبعد القيلولة 😴', 'اختار صورة لطيفة من لحظات الراحة.'),
    ('negm-elcamera', 'نجم الكاميرا 📸', 'ورّينا الصورة اللي حيوانك طالع فيها موديل.'),
    ('sohba', 'أجمل صحوبية ❤️', 'صورة لطيفة لحيوانك مع صاحبه.'),
    ('baraa', 'البراءة بعد المصيبة 🤭', 'اللحظة اللي بيعمل فيها مش واخد باله من حاجة.'),
    ('gaaan', 'أنا جوعان يا بشر 🍽️', 'ورّينا تعبير حيوانك وقت الأكل المعتاد.'),
    ('elain', 'العين اللي بتتكلم 🥺', 'صورة لنظرة حيوانك المميزة.'),
    ('dalaa', 'يوم الدلع 🛋️', 'شارك لحظة استرخاء لطيفة.'),
    ('cats-dogs', 'القطط ضد الكلاب 🐱🐶', 'شارك أجمل لقطة لحيوانك بدون تصويت إقصائي.'),
]

class Command(BaseCommand):
    help = 'Create editable challenge drafts without publishing or scheduling them.'
    def handle(self, *args, **options):
        for slug, title, description in PROMPTS:
            DailyChallenge.objects.get_or_create(slug=slug, defaults={'title': title, 'description': description})
        self.stdout.write(self.style.SUCCESS('Challenge drafts ready'))
