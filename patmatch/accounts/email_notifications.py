import logging

from .email_delivery import (
    EMAIL_CATEGORY_TRANSACTIONAL,
    build_rtl_email_html,
    send_email_payload,
)

logger = logging.getLogger(__name__)


def send_welcome_email(user):
    """Send welcome email with branded HTML + text fallback."""
    if not user.email:
        logger.warning("Cannot send welcome email, user %s has no email", user.id)
        return

    language = user.preferred_language if user.preferred_language in {"ar", "en"} else "ar"
    is_en = language == "en"
    subject = "🎉 Welcome to Petow!" if is_en else "🎉 مرحباً بك في Petow!"
    first_name = user.first_name or user.get_full_name() or ("Friend" if is_en else "صديقنا")
    app_add_pet_link = "petow://add-pet"
    web_fallback_link = "https://petow.app"
    whatsapp_number = "201272011482"

    text_body = (f"Hello {first_name},\n\nWelcome to the Petow community.\nAdd your pet to discover breeding and adoption opportunities.\n\nOpen the app: {app_add_pet_link}\nWeb alternative: {web_fallback_link}\n\nNeed help? Contact us on WhatsApp: +{whatsapp_number}\n\nYou received this email because a Petow account was created.\n\nThe Petow team") if is_en else (
        f"مرحباً {first_name},\n\n"
        "سعداء بانضمامك إلى مجتمع Petow.\n"
        "ابدأ بإضافة حيوانك الأليف لتكتشف أفضل فرص التزاوج والتبني.\n\n"
        f"فتح التطبيق مباشرة: {app_add_pet_link}\n"
        f"إذا لم يعمل الرابط، استخدم الويب: {web_fallback_link}\n\n"
        "إذا احتجت أي مساعدة أو لديك اقتراح، تواصل معنا عبر واتساب: +" + whatsapp_number + "\n\n"
        "سبب استلامك لهذا البريد: إنشاء حساب جديد في Petow.\n\n"
        "فريق Petow"
    )

    html_body = build_rtl_email_html(
        title=(f"Welcome, {first_name} 👋" if is_en else f"مرحباً {first_name} 👋"),
        body_html=(("<p style=\"margin:0 0 14px;\">Welcome to the <strong>Petow</strong> community.</p><p style=\"margin:0 0 14px;\">Add your pet now to discover breeding and adoption opportunities.</p>") if is_en else (
            "<p style=\"margin:0 0 14px;\">سعداء بانضمامك إلى مجتمع <strong>Petow</strong>.</p>"
            "<p style=\"margin:0 0 14px;\">ابدأ بإضافة حيوانك الأليف الآن للحصول على أفضل فرص التزاوج والتبني.</p>"
        )),
        primary_label="Open app and add a pet" if is_en else "فتح التطبيق وإضافة حيوان",
        primary_url=app_add_pet_link,
        secondary_label="Web alternative" if is_en else "رابط بديل عبر الويب",
        secondary_url=web_fallback_link,
        why_you_received="You received this email because a Petow account was created." if is_en else "سبب استلامك لهذا البريد: إنشاء حساب جديد في Petow.",
        support_whatsapp=whatsapp_number,
        language=language,
    )

    try:
        send_email_payload(
            to_email=user.email,
            subject=subject,
            text_body=text_body,
            html_body=html_body,
            category=EMAIL_CATEGORY_TRANSACTIONAL,
            metadata={
                "email_type": "welcome",
                "user_id": user.id,
            },
        )
    except Exception as exc:
        logger.error("Failed to send welcome email to %s: %s", user.email, exc)


def send_account_verification_approved_email(user):
    """Notify user that account verification is approved."""
    if not user.email:
        logger.warning("Cannot send verification approval email, user %s has no email", user.id)
        return

    language = user.preferred_language if user.preferred_language in {"ar", "en"} else "ar"
    is_en = language == "en"
    subject = "✅ Your Petow account is verified" if is_en else "✅ تم اعتماد التحقق من حسابك في Petow"

    first_name = user.first_name or user.get_full_name() or ("Friend" if is_en else "صديقنا")
    app_profile_link = "petow://profile"
    web_fallback_link = "https://petow.app/profile"

    text_body = (f"Hello {first_name},\n\nCongratulations, your Petow account verification was approved.\nYou can now use all app features.\n\nOpen your profile: {app_profile_link}\nWeb alternative: {web_fallback_link}\n\nYou received this email because your verification status changed.\n\nThe Petow team") if is_en else (
        f"مرحباً {first_name},\n\n"
        "تهانينا، تم اعتماد التحقق من حسابك في Petow.\n"
        "يمكنك الآن استخدام كل مزايا التطبيق.\n\n"
        f"فتح الملف الشخصي داخل التطبيق: {app_profile_link}\n"
        f"رابط بديل عبر الويب: {web_fallback_link}\n\n"
        "سبب استلامك لهذا البريد: تحديث حالة التحقق في حسابك.\n\n"
        "فريق Petow"
    )

    html_body = build_rtl_email_html(
        title=f"Your account is verified, {first_name} ✅" if is_en else f"تم اعتماد حسابك يا {first_name} ✅",
        body_html=(("<p style=\"margin:0 0 14px;\">Congratulations, your <strong>Petow</strong> account verification was approved.</p><p style=\"margin:0 0 14px;\">You can now use all app features.</p>") if is_en else (
            "<p style=\"margin:0 0 14px;\">تهانينا، تم اعتماد التحقق من حسابك في <strong>Petow</strong>.</p>"
            "<p style=\"margin:0 0 14px;\">يمكنك الآن استخدام كل مزايا التطبيق بدون قيود.</p>"
        )),
        primary_label="Open my profile" if is_en else "فتح ملفي الشخصي",
        primary_url=app_profile_link,
        secondary_label="Web alternative" if is_en else "رابط بديل عبر الويب",
        secondary_url=web_fallback_link,
        why_you_received="You received this email because your verification status changed." if is_en else "سبب استلامك لهذا البريد: تحديث حالة التحقق في حسابك.",
        language=language,
    )

    try:
        send_email_payload(
            to_email=user.email,
            subject=subject,
            text_body=text_body,
            html_body=html_body,
            category=EMAIL_CATEGORY_TRANSACTIONAL,
            metadata={
                "email_type": "verification_approved",
                "user_id": user.id,
            },
        )
    except Exception as exc:
        logger.error("Failed to send verification approval email to %s: %s", user.email, exc)


def send_password_reset_email(user, otp_code):
    """Send password-reset OTP email (HTML + text fallback)."""
    if not user.email:
        logger.warning("Cannot send password reset email, user %s has no email", user.id)
        return

    language = user.preferred_language if user.preferred_language in {"ar", "en"} else "ar"
    is_en = language == "en"
    subject = "Password reset code - Petow" if is_en else "كود إعادة تعيين كلمة المرور - Petow"
    first_name = user.first_name or user.get_full_name() or ("Friend" if is_en else "صديقنا")
    reset_link = "petow://reset-password"
    fallback_link = "https://petow.app/reset-password"

    text_body = (f"Hello {first_name},\n\nA password reset was requested for your Petow account.\nVerification code: {otp_code}\n\nThis code is valid for 15 minutes.\nOpen the app: {reset_link}\nWeb alternative: {fallback_link}\n\nYou received this email because a password reset was requested.\n\nThe Petow team") if is_en else (
        f"مرحباً {first_name},\n\n"
        "تم طلب إعادة تعيين كلمة المرور لحسابك في Petow.\n"
        f"كود التحقق: {otp_code}\n\n"
        "الكود صالح لمدة 15 دقيقة فقط.\n"
        f"رابط فتح التطبيق: {reset_link}\n"
        f"رابط بديل عبر الويب: {fallback_link}\n\n"
        "سبب استلامك لهذا البريد: طلب إعادة تعيين كلمة المرور.\n\n"
        "فريق Petow"
    )

    html_body = build_rtl_email_html(
        title="Reset your password" if is_en else "إعادة تعيين كلمة المرور",
        body_html=(((f"<p style=\"margin:0 0 14px;\">Hello {first_name}, you requested a password reset.</p><p style=\"margin:0 0 14px;\">Verification code:</p><p style=\"margin:0 0 18px;text-align:center;font-size:34px;letter-spacing:8px;font-weight:700;\">{otp_code}</p><p style=\"margin:0 0 14px;\">The code is valid for <strong>15 minutes</strong>.</p>")) if is_en else (
            f"<p style=\"margin:0 0 14px;\">مرحباً {first_name}، وصلك هذا البريد لأنك طلبت إعادة تعيين كلمة المرور.</p>"
            "<p style=\"margin:0 0 14px;\">كود التحقق:</p>"
            f"<p style=\"margin:0 0 18px;text-align:center;font-size:34px;letter-spacing:8px;font-weight:700;\">{otp_code}</p>"
            "<p style=\"margin:0 0 14px;\">الكود صالح لمدة <strong>15 دقيقة</strong> فقط.</p>"
        )),
        primary_label="Open password reset" if is_en else "فتح صفحة إعادة التعيين داخل التطبيق",
        primary_url=reset_link,
        secondary_label="Web alternative" if is_en else "رابط بديل عبر الويب",
        secondary_url=fallback_link,
        why_you_received="You received this email because a password reset was requested." if is_en else "سبب استلامك لهذا البريد: طلب إعادة تعيين كلمة المرور.",
        language=language,
    )

    try:
        send_email_payload(
            to_email=user.email,
            subject=subject,
            text_body=text_body,
            html_body=html_body,
            category=EMAIL_CATEGORY_TRANSACTIONAL,
            metadata={
                "email_type": "password_reset_otp",
                "user_id": user.id,
            },
        )
    except Exception as exc:
        logger.error("Failed to send password reset email to %s: %s", user.email, exc)
