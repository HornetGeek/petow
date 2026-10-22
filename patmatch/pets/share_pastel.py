"""Arabic-first pastel pet share card, rendered from public listing data."""
import io
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps, features
import qrcode

PALETTE = {'mint': '#EDF9F4', 'pink': '#FCEAF0', 'lilac': '#EDE5FA',
           'teal': '#126F6D', 'ink': '#101828', 'muted': '#475467'}
ROOT = Path(__file__).parent
CITIES = (
    'القاهرة', 'الجيزة', 'الإسكندرية', 'القليوبية', 'البحيرة', 'الشرقية',
    'الدقهلية', 'الغربية', 'المنوفية', 'كفر الشيخ', 'الفيوم', 'بني سويف',
    'المنيا', 'أسيوط', 'سوهاج', 'قنا', 'الأقصر', 'أسوان', 'دمياط', 'بورسعيد',
    'الإسماعيلية', 'السويس', 'شمال سيناء', 'جنوب سيناء', 'البحر الأحمر',
    'الوادي الجديد', 'مطروح', 'Cairo', 'Giza', 'Alexandria',
)


def font(size):
    face = ImageFont.truetype(str(ROOT / 'fonts' / 'Cairo.ttf'), size)
    face.set_variation_by_axes([800 if size >= 80 else 700 if size >= 44 else 600, 0])
    return face


def text(draw, center, value, size, fill, max_width, min_size=21):
    """Draw Arabic text centered; fit text without truncating words."""
    value = str(value).strip()
    for current in range(size, min_size - 1, -1):
        face = font(current)
        if draw.textbbox((0, 0), value, font=face, direction='rtl')[2] <= max_width:
            draw.text(center, value, font=face, fill=fill, anchor='mm', direction='rtl')
            return
    # A very long pet name may require two lines.
    words = value.split()
    if len(words) > 1:
        midpoint = (len(words) + 1) // 2
        text(draw, (center[0], center[1] - 17), ' '.join(words[:midpoint]),
             min_size, fill, max_width, min_size)
        text(draw, (center[0], center[1] + 17), ' '.join(words[midpoint:]),
             min_size, fill, max_width, min_size)
    else:
        draw.text(center, value[:25], font=font(min_size), fill=fill,
                  anchor='mm', direction='rtl')


def city_from_location(raw):
    """Only use a known governorate/city token; never print a full address."""
    words = re.split(r'[,،/|\n]+', raw or '')
    for word in words:
        token = word.strip()
        for city in CITIES:
            if token.casefold() == city.casefold():
                return city
    return None


def pet_photo(field):
    if not field:
        return None
    try:
        with field.open('rb') as source:
            image = Image.open(source)
            image = ImageOps.exif_transpose(image)
            if image.width * image.height > 40_000_000:
                return None
            return image.convert('RGB')
    except (OSError, ValueError):
        return None


def photo_panel(canvas, image, box, radius=42):
    left, top, right, bottom = box
    width, height = right-left, bottom-top
    blurred = ImageOps.fit(image, (width, height)).filter(ImageFilter.GaussianBlur(18))
    contained = ImageOps.contain(image, (width, height))
    blurred.paste(contained, ((width-contained.width)//2, (height-contained.height)//2))
    mask = Image.new('L', (width, height), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, width-1, height-1), radius=radius, fill=255)
    canvas.paste(blurred, (left, top), mask)


def render_pastel(pet, url, fmt):
    if not features.check_feature('raqm'):
        raise RuntimeError('Pillow Arabic shaping requires libraqm')
    height = 1920 if fmt == 'story' else 1350
    shift = 285 if fmt == 'story' else 0
    canvas = Image.new('RGB', (1080, height), PALETTE['mint'])
    draw = ImageDraw.Draw(canvas)
    draw.ellipse((-255, -315, 455, 395), fill=PALETTE['pink'])
    draw.ellipse((700, height-305, 1330, height+325), fill=PALETTE['lilac'])
    if fmt == 'story':
        draw.ellipse((-200, height-320, 300, height+180), fill='#D8F3EF')
    text(draw, (540, shift+66), 'قلب صغير، حُب كبير', 30, PALETTE['teal'], 800)
    text(draw, (540, shift+160), pet.name, 106, PALETTE['teal'], 920, 44)
    adoption = pet.status == 'available_for_adoption'
    female = pet.gender == 'F'
    headline = (('بتدور على بيت جديد' if female else 'بيدور على بيت جديد') if adoption
                else ('بتدور على شريك مناسب' if female else 'بيدور على شريكة مناسبة'))
    support = 'ساعدها تلاقي حد يحبها' if adoption and female else (
        'ساعده يلاقي حد يحبه' if adoption else
         ('تعرفوا عليها على Petow' if female else 'تعرفوا عليه على Petow'))
    text(draw, (540, shift+267), headline, 54, PALETTE['ink'], 940, 33)
    text(draw, (540, shift+339), support, 32, PALETTE['muted'], 900)

    image = pet_photo(pet.main_image)
    if image is None:
        raise RuntimeError('Shareable pet has no readable main photo')
    draw.rounded_rectangle((54, shift+375, 1026, shift+1015), radius=48, fill='white')
    photo_panel(canvas, image, (62, shift+383, 1018, shift+1007))
    draw = ImageDraw.Draw(canvas)
    status = ('متاحة للتبني' if female else 'متاح للتبني') if adoption else (
        'متاحة للتزاوج' if female else 'متاح للتزاوج')
    draw.rounded_rectangle((714, shift+409, 990, shift+486), radius=36, fill='white')
    draw.ellipse((956, shift+441, 968, shift+453), fill='#13AAA5')
    text(draw, (834, shift+445), status, 30, PALETTE['teal'], 215, 24)

    # Additional listing photos appear as small keepsakes over the photo edge.
    for index, field in enumerate((pet.image_2, pet.image_3)):
        extra = pet_photo(field)
        if extra is None:
            continue
        x = 78 + index*166
        y = shift+866 + index*9
        draw.rounded_rectangle((x-7, y-7, x+150, y+169), radius=19, fill='white')
        photo_panel(canvas, extra, (x, y, x+143, y+151), 13)

    facts = [pet.get_pet_type_display(), pet.age_display,
             'أنثى' if female else 'ذكر', city_from_location(pet.location)]
    if pet.breed_id and pet.breed.name:
        facts.insert(1, pet.breed.name)
    facts = [f for f in facts if f]
    # Fit a variable count of facts without leaking the original location.
    widths = [min(220, max(125, int(draw.textbbox((0, 0), f, font=font(29), direction='rtl')[2]+45))) for f in facts]
    total = sum(widths) + 10*(len(widths)-1)
    if total > 960:
        facts = [f for f in facts if f != (pet.breed.name if pet.breed_id else None)]
        widths = [min(225, max(125, int(draw.textbbox((0, 0), f, font=font(27), direction='rtl')[2]+42))) for f in facts]
        total = sum(widths) + 10*(len(widths)-1)
    x = (1080+total)//2
    for fact, width in zip(facts, widths):
        draw.rounded_rectangle((x-width, shift+1066, x, shift+1145), radius=24, fill='#FFFFFF')
        text(draw, (x-width//2, shift+1105), fact, 29, '#234B49', width-22, 22)
        x -= width+10

    draw.line((60, shift+1191, 1020, shift+1191), fill='#CEE2DC', width=2)
    # A real QR is needed because image-only destinations may drop the share caption.
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=6, border=2)
    qr.add_data(url)
    qr.make(fit=True)
    qr_image = qr.make_image(fill_color='#101828', back_color='white').convert('RGB')
    qr_image.thumbnail((112, 112), Image.NEAREST)
    canvas.paste(qr_image, (64, shift+1206))
    draw = ImageDraw.Draw(canvas)
    text(draw, (535, shift+1235), f'تعرف على {pet.name} على Petow', 29,
         PALETTE['teal'], 600, 23)
    text(draw, (535, shift+1280), 'امسح الكود أو افتح الرابط مع الصورة', 22,
         PALETTE['muted'], 600, 18)
    logo = Image.open(ROOT / 'assets' / 'petow-logo.jpeg').convert('RGB')
    # Trim only the logo source's white margins.
    logo = logo.crop((93, 125, 548, 455))
    logo.thumbnail((165, 100), Image.LANCZOS)
    draw.rounded_rectangle((840, shift+1206, 1018, shift+1312), radius=18, fill='white')
    canvas.paste(logo, (847+(165-logo.width)//2, shift+1209+(100-logo.height)//2))
    result = io.BytesIO()
    canvas.save(result, format='JPEG', quality=90, optimize=True, progressive=True)
    result.seek(0)
    return result
