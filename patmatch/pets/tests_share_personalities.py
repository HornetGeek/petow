"""Regression coverage for personalized pet cards."""
import io
import unittest
from types import SimpleNamespace

from PIL import Image
from pets.share_personalities import render_personality


class PhotoField:
    def open(self, _mode):
        source = io.BytesIO()
        Image.new('RGB', (640, 480), '#c58d70').save(source, format='JPEG')
        source.seek(0)
        return source


class PersonalityCardTests(unittest.TestCase):
    def test_all_styles_fit_a_long_arabic_caption_in_both_formats(self):
        pet = SimpleNamespace(name='لي لي', main_image=PhotoField(),
                              status='available_for_adoption', gender='F',
                              breed_id=None, age_display='سنة', location='القاهرة')
        caption = ('أنا لي لي ودي صورة ليا على Petow عشان تتعرفوا عليّا أكتر '
                   'وتشوفوا التفاصيل الموجودة في ملفي العام مع مراعاة إن كل '
                   'المعلومات هنا عامة فقط 🐾')
        for style in ('funny', 'cute', 'royal'):
            for fmt, expected in (('post', (1080, 1350)), ('story', (1080, 1920))):
                with self.subTest(style=style, fmt=fmt):
                    card = Image.open(render_personality(
                        pet, 'https://petow.app/p/1', fmt, style, caption))
                    self.assertEqual(card.size, expected)
                    self.assertEqual(card.format, 'JPEG')
                    self.assertTrue(all(abs(actual - expected) <= 4 for actual, expected in zip(card.getpixel((540, 500)), (197, 141, 112))))

    def test_english_caption_renders_in_both_formats(self):
        pet = SimpleNamespace(name='Lily', main_image=PhotoField(),
                              status='available_for_adoption', gender='F',
                              breed_id=None, age_months=14, age_display='سنة و 2 شهر', location='Cairo')
        for fmt in ('post', 'story'):
            with self.subTest(fmt=fmt):
                card = Image.open(render_personality(
                    pet, 'https://petow.app/p/1', fmt, 'funny',
                    'Meet Lily: clearly ready for the spotlight'))
                self.assertEqual(card.size, (1080, 1920 if fmt == 'story' else 1350))


if __name__ == '__main__':
    unittest.main()
