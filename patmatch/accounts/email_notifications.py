import logging
from django.conf import settings
from django.core.mail import EmailMultiAlternatives

logger = logging.getLogger(__name__)


def send_welcome_email(user):
    """Send a branded welcome email encouraging the user to add a pet and providing support info."""
    if not user.email:
        logger.warning("Cannot send welcome email, user %s has no email", user.id)
        return

    subject = "🎉 مرحباً بك في Petow!"
    from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', None) or getattr(settings, 'SERVER_EMAIL', None)
    if not from_email:
        logger.warning("No DEFAULT_FROM_EMAIL configured; skipping welcome email for %s", user.email)
        return

    first_name = user.first_name or user.get_full_name() or "صديقنا"
    whatsapp_number = "201272011482"
    whatsapp_link = f"https://wa.me/{whatsapp_number}"

    app_add_pet_link = "petow://add-pet"

    text_body = (
        f"مرحباً {first_name},\n\n"
        "نحن سعداء بانضمامك إلى مجتمع Petow. أضف حيوانك الأليف الآن لتبدأ في اكتشاف أصدقاء جدد له!\n\n"
        f"اضغط هنا لفتح التطبيق وإضافة حيوانك مباشرة: {app_add_pet_link}\n\n"
        "إذا احتجت أي مساعدة أو لديك اقتراح، تواصل معنا عبر واتساب: +" + whatsapp_number + "\n\n"
        "مع تحيات فريق Petow"
    )

    html_body = f"""
    <html>
      <body style="background-color:#f6f9fc;font-family:'Tajawal',Arial,sans-serif;color:#1f2933;margin:0;padding:0;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td align="center" style="padding:40px 16px;">
              <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 14px 30px rgba(15,23,42,0.08);">
                <tr>
                  <td style="background:linear-gradient(135deg,#667eea,#764ba2);padding:30px 24px;color:#ffffff;">
                    <h1 style="margin:0;font-size:26px;">مرحبا {first_name}! 👋</h1>
                    <p style="margin:10px 0 0;font-size:16px;opacity:0.9;">سعداء بانضمامك إلى عائلة Petow.</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:30px 28px;">
                    <p style="font-size:16px;line-height:1.8;margin:0 0 18px;">نحن هنا لمساعدتك على العثور على أفضل شريك لحيوانك الأليف أو رفقاء جدد في منطقتك.</p>
                    <p style="font-size:16px;line-height:1.8;margin:0 0 28px;">
                      ابدأ رحلتك بإضافة حيوانك الآن، وشارك القصة مع مجتمع مربي الحيوانات الأليفة.
                    </p>
                    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
                      <tr>
                        <td style="background:#667eea;border-radius:999px;">
                          <a href="{app_add_pet_link}" style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-weight:bold;">🚀 أضف حيوانك الآن</a>
                        </td>
                      </tr>
                    </table>
                    <div style="background:#f1f5f9;border-radius:12px;padding:16px 18px;margin-bottom:24px;">
                      <h3 style="margin:0 0 8px;font-size:16px;color:#0f172a;">بحاجة لمساعدة؟</h3>
                      <p style="margin:0;font-size:14px;line-height:1.6;">
                        فريق الدعم متواجد دائماً عبر واتساب. فقط اضغط على الرابط أدناه وراسلنا متى شئت.
                      </p>
                      <p style="margin:12px 0 0;">
                        <a href="{whatsapp_link}" style="color:#0ea5e9;font-weight:bold;text-decoration:none;">💬 تواصل عبر واتساب: +{whatsapp_number}</a>
                      </p>
                    </div>
                    <p style="font-size:14px;color:#475569;line-height:1.6;margin:0;">
                      شكراً لثقتك بنا، ونتطلع لرؤية حيوانك ضمن قصص النجاح القادمة!<br/>
                      فريق <strong>Petow</strong>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
    """

    email = EmailMultiAlternatives(subject, text_body, from_email, [user.email])
    email.attach_alternative(html_body, "text/html")
    try:
        email.send(fail_silently=False)
        logger.info("Welcome email sent to %s", user.email)
    except Exception as exc:
        logger.error("Failed to send welcome email to %s: %s", user.email, exc)


def send_account_verification_approved_email(user):
    """Notify the user that their account verification has been approved."""
    if not user.email:
        logger.warning("Cannot send verification approval email, user %s has no email", user.id)
        return

    subject = "✅ تم اعتماد التحقق من حسابك في Petow"
    from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', None) or getattr(settings, 'SERVER_EMAIL', None)
    if not from_email:
        logger.warning("No DEFAULT_FROM_EMAIL configured; skipping verification approval email for %s", user.email)
        return

    first_name = user.first_name or user.get_full_name() or "صديقنا"
    app_profile_link = "petow://profile"

    text_body = (
        f"مرحباً {first_name},\n\n"
        "تهانينا! تم اعتماد التحقق من حسابك في Petow بنجاح.\n"
        "يمكنك الآن الاستفادة من جميع مزايا التطبيق بدون أي قيود.\n\n"
        "نقترح عليك تحديث ملفك الشخصي والتأكد من إضافة حيواناتك الأليفة وصورهم المميزة.\n"
        "للوصول السريع إلى ملفك الشخصي اضغط على الرابط التالي:\n"
        f"{app_profile_link}\n\n"
        "إذا احتجت أي مساعدة يمكنك دائماً التواصل معنا من داخل التطبيق أو عبر فريق الدعم.\n\n"
        "مع تحيات فريق Petow"
    )

    html_body = f"""
    <html>
      <body style="background-color:#f6f9fc;font-family:'Tajawal',Arial,sans-serif;color:#0f172a;margin:0;padding:0;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td align="center" style="padding:36px 16px;">
              <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 14px 30px rgba(15,23,42,0.08);">
                <tr>
                  <td style="background:linear-gradient(135deg,#22c55e,#16a34a);padding:28px 24px;color:#ffffff;">
                    <h1 style="margin:0;font-size:26px;">تهانينا {first_name}! 🎉</h1>
                    <p style="margin:10px 0 0;font-size:16px;opacity:0.9;">تم اعتماد التحقق من حسابك في Petow.</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:30px 28px;">
                    <p style="font-size:16px;line-height:1.8;margin:0 0 18px;">
                      يمكنك الآن الاستفادة من جميع مزايا التطبيق بدون قيود والبحث عن شركاء مناسبين لحيوانك الأليف بثقة كاملة.
                    </p>
                    <p style="font-size:16px;line-height:1.8;margin:0 0 24px;">
                      لا تنس تحديث ملفك الشخصي وإضافة صور مميزة لحيواناتك الأليفة لجذب المزيد من الاهتمام.
                    </p>
                    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 26px;">
                      <tr>
                        <td style="background:#22c55e;border-radius:999px;">
                          <a href="{app_profile_link}" style="display:inline-block;padding:14px 30px;color:#ffffff;text-decoration:none;font-weight:bold;">
                            👤 عرض ملفي الشخصي
                          </a>
                        </td>
                      </tr>
                    </table>
                    <p style="font-size:14px;color:#475569;line-height:1.7;margin:0;">
                      إذا احتجت أي مساعدة إضافية، يسعدنا تواصلك معنا عبر التطبيق أو فريق الدعم.<br/>
                      مع تحيات فريق <strong>Petow</strong>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
    """

    email = EmailMultiAlternatives(subject, text_body, from_email, [user.email])
    email.attach_alternative(html_body, "text/html")
    try:
        email.send(fail_silently=False)
        logger.info("Verification approval email sent to %s", user.email)
    except Exception as exc:
        logger.error("Failed to send verification approval email to %s: %s", user.email, exc)


def send_password_reset_email(user, otp_code):
    """Send password-reset OTP with rich HTML template"""
    if not user.email:
        logger.warning("Cannot send password reset email, user %s has no email", user.id)
        return

    subject = 'كود إعادة تعيين كلمة المرور - Petow'
    from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', None) or getattr(settings, 'SERVER_EMAIL', None)
    if not from_email:
        logger.warning("No DEFAULT_FROM_EMAIL configured; skipping password reset email for %s", user.email)
        return

    first_name = user.first_name or user.get_full_name() or 'صديقنا'

    text_body = (
        f"مرحباً {first_name},\n\n"
        "تم طلب إعادة تعيين كلمة المرور لحسابك في Petow.\n\n"
        f"كود التحقق الخاص بك هو: {otp_code}\n\n"
        "هذا الكود صالح لمدة 15 دقيقة فقط. إذا لم تطلب إعادة تعيين كلمة المرور، يرجى تجاهل هذه الرسالة.\n\n"
        "فريق Petow"
    )

    html_body = f"""
    <html>
      <body style="background-color:#f6f9fc;font-family:'Tajawal',Arial,sans-serif;color:#1f2937;margin:0;padding:0;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td align="center" style="padding:32px 12px;">
              <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 12px 28px rgba(15,23,42,0.08);">
                <tr>
                  <td style="background:linear-gradient(135deg,#f97316,#fb7185);padding:26px 22px;color:#ffffff;">
                    <h1 style="margin:0;font-size:24px;">إعادة تعيين كلمة المرور</h1>
                    <p style="margin:8px 0 0;font-size:15px;opacity:0.9;">مرحبا {first_name} 👋</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:28px 26px;">
                    <p style="font-size:15px;line-height:1.8;margin:0 0 18px;">
                      وصلك هذا البريد لأنك طلبت إعادة تعيين كلمة المرور لحسابك في <strong>Petow</strong>.
                    </p>
                    <p style="margin:0 0 24px;font-size:32px;font-weight:bold;text-align:center;letter-spacing:6px;color:#1e293b;">
                      {otp_code}
                    </p>
                    <p style="font-size:14px;line-height:1.7;margin:0 0 18px;">
                      الكود صالح لمدة <strong>15 دقيقة</strong>. إذا لم تكن أنت من طلب إعادة التعيين فيمكنك تجاهل هذه الرسالة.
                    </p>
                    <p style="font-size:14px;color:#475569;line-height:1.6;margin:0;">
                      مع تحيات فريق <strong>Petow</strong>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
    """

    email = EmailMultiAlternatives(subject, text_body, from_email, [user.email])
    email.attach_alternative(html_body, "text/html")
    try:
        email.send(fail_silently=False)
        logger.info("Password reset email sent to %s", user.email)
    except Exception as exc:
        logger.error("Failed to send password reset email to %s: %s", user.email, exc)
