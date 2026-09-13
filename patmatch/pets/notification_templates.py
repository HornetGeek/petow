SUPPORTED_LANGUAGES = {'ar', 'en'}

TEMPLATES = {
    'breeding_request_received': {
        'ar': ('طلب تزاوج جديد من {requester_name}', 'افتح الطلب لمراجعة التفاصيل والرد عليه.'),
        'en': ('New breeding request from {requester_name}', 'Open the request to review the details and respond.'),
    },
    'breeding_request_approved': {
        'ar': ('تم قبول طلب التزاوج مع {pet_name}', 'تم قبول طلبك. افتح التطبيق لمتابعة ترتيب المقابلة.'),
        'en': ('Breeding request with {pet_name} approved', 'Your request was approved. Open the app to arrange the meeting.'),
    },
    'breeding_request_rejected': {
        'ar': ('تم رفض طلب التزاوج مع {pet_name}', 'يمكنك البحث عن حيوانات أخرى مناسبة للتزاوج.'),
        'en': ('Breeding request with {pet_name} declined', 'You can search for other suitable pets for breeding.'),
    },
    'breeding_request_pending_reminder': {
        'ar': ('تذكير بطلب تزاوج لـ {pet_name}', 'لديك طلب تزاوج ما زال قيد الانتظار.'),
        'en': ('Breeding request reminder for {pet_name}', 'You have a breeding request that is still pending.'),
    },
    'breeding_request_completed': {
        'ar': ('تم إكمال المقابلة بنجاح', 'تم إكمال مقابلة التزاوج بنجاح. نتمنى لكم التوفيق.'),
        'en': ('Meeting completed', 'The breeding meeting was completed successfully. Best of luck!'),
    },
    'adoption_request_received': {
        'ar': ('طلب تبني جديد لحيوانك {pet_name}', 'يريد {adopter_name} تبني حيوانك. افتح الطلب لمراجعته.'),
        'en': ('New adoption request for {pet_name}', '{adopter_name} wants to adopt your pet. Open the request to review it.'),
    },
    'adoption_request_approved': {
        'ar': ('تم قبول طلب تبني {pet_name}', 'مبروك! تم قبول طلب التبني الخاص بك.'),
        'en': ('Adoption request for {pet_name} approved', 'Congratulations! Your adoption request was approved.'),
    },
    'adoption_request_pending_reminder': {
        'ar': ('تذكير بطلب تبني لـ {pet_name}', 'لديك طلب تبني ما زال قيد الانتظار.'),
        'en': ('Adoption request reminder for {pet_name}', 'You have an adoption request that is still pending.'),
    },
    'chat_message_received': {
        'ar': ('رسالة جديدة من {sender_name}', None),
        'en': ('New message from {sender_name}', None),
    },
    'favorite_added': {
        'ar': ('تمت إضافة {pet_name} إلى المفضلة', 'أضاف مستخدم حيوانك إلى قائمة المفضلة.'),
        'en': ('{pet_name} was added to favorites', 'A user added your pet to their favorites.'),
    },
    'pet_status_changed': {
        'ar': ('تم تغيير حالة {pet_name}', 'تم تحديث حالة حيوانك.'),
        'en': ('{pet_name} status changed', 'Your pet status was updated.'),
    },
    'pet_nearby': {
        'ar': ('حيوان جديد بالقرب منك', '{pet_name} متاح الآن للتزاوج بالقرب منك.'),
        'en': ('A new pet is near you', '{pet_name} is now available for breeding nearby.'),
    },
    'adoption_pet_nearby': {
        'ar': ('فرصة تبني قريبة منك', '{pet_name} متاح للتبني بالقرب منك.'),
        'en': ('An adoption opportunity is near you', '{pet_name} is available for adoption nearby.'),
    },
    'saved_search_match': {
        'ar': ('نتيجة جديدة لبحثك المحفوظ', 'وجدنا نتيجة جديدة تطابق بحثك.'),
        'en': ('A new saved-search match', 'We found a new result matching your saved search.'),
    },
    'account_verification_approved': {
        'ar': ('تم توثيق حسابك', 'تمت الموافقة على طلب توثيق حسابك.'),
        'en': ('Your account is verified', 'Your account verification request was approved.'),
    },
}


class _SafeContext(dict):
    def __missing__(self, key):
        return ''


def has_template(template_key):
    return template_key in TEMPLATES


def render_notification(template_key, context, language, fallback_title, fallback_message):
    language = language if language in SUPPORTED_LANGUAGES else 'ar'
    template = TEMPLATES.get(template_key, {}).get(language)
    if not template:
        return fallback_title, fallback_message
    values = _SafeContext(context or {})
    title_template, message_template = template
    title = title_template.format_map(values) if title_template else fallback_title
    message = message_template.format_map(values) if message_template else fallback_message
    return title.strip() or fallback_title, message.strip() or fallback_message
