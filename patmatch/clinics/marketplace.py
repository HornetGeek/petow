MARKETPLACE_SERVICE_GROUPS = {
    'clinic_vaccination': {
        'label': 'عيادات وتطعيمات',
        'categories': ('general', 'vaccination', 'diagnostic'),
    },
    'grooming': {
        'label': 'تنظيف وتجميل',
        'categories': ('grooming',),
    },
    'boarding': {
        'label': 'استضافة ورعاية',
        'categories': ('boarding',),
    },
}


def get_marketplace_group_for_category(category):
    for group_key, config in MARKETPLACE_SERVICE_GROUPS.items():
        if category in config.get('categories', ()):
            return group_key
    return None


def get_marketplace_categories_for_group(group_key):
    group = MARKETPLACE_SERVICE_GROUPS.get(group_key)
    if not group:
        return None
    return list(group['categories'])
