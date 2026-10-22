"""Regression coverage for the production Pastel card renderer."""
import io
import unittest
from types import SimpleNamespace

from PIL import Image

from pets.share_pastel import render_pastel


class PhotoField:
    def __init__(self):
        source = io.BytesIO()
        Image.new('RGB', (320, 240), '#d7bca7').save(source, format='JPEG')
        self.data = source.getvalue()

    def open(self, _mode):
        return io.BytesIO(self.data)


class PastelCardRenderTests(unittest.TestCase):
    def test_adoption_and_breeding_render_in_post_and_story_formats(self):
        photo = PhotoField()
        cases = (
            ('available_for_adoption', 'F', 'post', (1080, 1350)),
            ('available_for_adoption', 'M', 'story', (1080, 1920)),
            ('available', 'F', 'post', (1080, 1350)),
            ('available', 'M', 'story', (1080, 1920)),
        )
        for status, gender, fmt, expected_size in cases:
            with self.subTest(status=status, gender=gender, fmt=fmt):
                pet = SimpleNamespace(
                    name='لي لي', status=status, gender=gender,
                    main_image=photo, image_2=None, image_3=None,
                    age_display='سنة', location='القاهرة',
                    breed_id=None, get_pet_type_display=lambda: 'قطة',
                )
                result = render_pastel(pet, 'https://petow.app/p/3384', fmt)
                image = Image.open(result)
                self.assertEqual(image.size, expected_size)
                self.assertEqual(image.format, 'JPEG')


if __name__ == '__main__':
    unittest.main()
