"""Photo-led, Arabic-first share cards using the original pet photograph."""
import io
import re

from PIL import Image, ImageDraw
import qrcode

from .share_pastel import city_from_location, font, pet_photo, photo_panel, text

STYLES = {
    'funny': {'bg': '#EDF9F4', 'accent': '#126F6D', 'soft': '#D8F3EF', 'decoration': '🐾'},
    'cute': {'bg': '#FFF4F0', 'accent': '#A94F69', 'soft': '#FCEAF0', 'decoration': '♡'},
    'royal': {'bg': '#F7F4EA', 'accent': '#735A2B', 'soft': '#F1E5C5', 'decoration': '♛'},
}


def _wrap(draw, value, size, width, limit):
    words = value.split()
    while size >= 25:
        face = font(size)
        lines = []
        current = ''
        for word in words:
            candidate = f'{current} {word}'.strip()
            if current and draw.textbbox((0, 0), candidate, font=face, direction='rtl')[2] > width:
                lines.append(current)
                current = word
            else:
                current = candidate
        if current:
            lines.append(current)
        if len(lines) <= limit and all(draw.textbbox((0, 0), line, font=face, direction='rtl')[2] <= width for line in lines):
            return lines, size
        size -= 2
    raise ValueError('Caption does not fit card')


def render_personality(pet, url, fmt, style, caption):
    if style not in STYLES or fmt not in {'post', 'story'}:
        raise ValueError('Unsupported share style or format')
    photo = pet_photo(pet.main_image)
    if photo is None:
        raise ValueError('No readable pet photograph')
    theme = STYLES[style]
    english = not re.search(r'[\u0600-\u06ff]', caption)
    caption = ''.join(ch for ch in caption if ord(ch) <= 0xFFFF and ch not in '\ufe0f\u200d')
    height = 1920 if fmt == 'story' else 1350
    story = fmt == 'story'
    canvas = Image.new('RGB', (1080, height), theme['bg'])
    draw = ImageDraw.Draw(canvas)
    draw.ellipse((-160, -200, 360, 310), fill=theme['soft'])
    draw.ellipse((840, height-240, 1280, height+180), fill=theme['soft'])
    if style == 'royal':
        draw.polygon([(74, 80), (91, 55), (110, 79), (130, 55), (149, 80), (149, 105), (74, 105)], fill=theme['accent'])
    elif style == 'cute':
        draw.ellipse((75, 67, 100, 92), fill=theme['accent'])
        draw.ellipse((95, 67, 120, 92), fill=theme['accent'])
        draw.polygon([(75, 79), (120, 79), (98, 109)], fill=theme['accent'])
    else:
        for x, y in ((85, 75), (120, 75), (101, 53)):
            draw.ellipse((x, y, x+14, y+14), fill=theme['accent'])
        draw.ellipse((87, 85, 127, 117), fill=theme['accent'])
    header_y = 245 if story else 35
    photo_top = header_y + 102
    photo_bottom = 1350 if story else 880
    draw.rounded_rectangle((52, photo_top-8, 1028, photo_bottom+8), radius=48, fill='white')
    photo_panel(canvas, photo, (60, photo_top, 1020, photo_bottom), 40)
    draw = ImageDraw.Draw(canvas)
    # Essential content remains away from common Story top and bottom controls.
    text(draw, (540, header_y+38), pet.name, 88, theme['accent'], 910, 40)
    content_top = photo_bottom + 48
    if english:
        purpose = 'Adopt me' if pet.status == 'available_for_adoption' else 'Breeding' if pet.status == 'available' else ''
    else:
        purpose = 'للتبني' if pet.status == 'available_for_adoption' else 'للتزاوج' if pet.status == 'available' else ''
    if purpose:
        draw.rounded_rectangle((790, photo_top+20, 996, photo_top+83), radius=30, fill='white')
        text(draw, (893, photo_top+51), purpose, 28, theme['accent'], 185, 22)
    lines, size = _wrap(draw, caption, 43 if story else 38, 920, 5 if story else 4)
    line_height = size * 1.55
    for index, line in enumerate(lines):
        text(draw, (540, content_top + index*line_height), line, size, '#101828', 920, size)
    facts_y = content_top + len(lines)*line_height + 30
    age_months = getattr(pet, 'age_months', None)
    if english and age_months is not None:
        years, months = divmod(age_months, 12)
        age = ', '.join(part for part in (
            f'{years} {"year" if years == 1 else "years"}' if years else '',
            f'{months} {"month" if months == 1 else "months"}' if months else '',
        ) if part) or 'Under 1 month'
    else:
        age = pet.age_display
    facts = [pet.breed.name if pet.breed_id else None, age,
             ('Female' if pet.gender == 'F' else 'Male' if pet.gender == 'M' else None) if english
             else ('أنثى' if pet.gender == 'F' else 'ذكر' if pet.gender == 'M' else None),
             city_from_location(pet.location)]
    facts = [item for item in facts if item]
    fact_line = '  •  '.join(facts)
    if fact_line:
        text(draw, (540, facts_y), fact_line, 26, '#475467', 940, 21)
    footer_y = height - (220 if story else 90)
    draw.line((60, footer_y-60, 1020, footer_y-60), fill=theme['accent'], width=2)
    text(draw, (630, footer_y-7), 'See my profile on Petow' if english else 'شوف ملفي على Petow', 29, theme['accent'], 410, 23)
    draw.text((72, footer_y-32), 'Petow', font=font(43), fill=theme['accent'])
    if not story:
        qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=5, border=2)
        qr.add_data(url)
        qr.make(fit=True)
        image = qr.make_image(fill_color='#101828', back_color='white').convert('RGB')
        image.thumbnail((135, 135), Image.NEAREST)
        canvas.paste(image, (905, height-158))
    output = io.BytesIO()
    canvas.save(output, format='JPEG', quality=88, optimize=True, progressive=True)
    output.seek(0)
    return output
