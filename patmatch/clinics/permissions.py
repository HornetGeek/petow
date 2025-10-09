from rest_framework.permissions import BasePermission


class IsClinicStaff(BasePermission):
    """سماح فقط لحسابات العيادات بالوصول إلى الموارد."""

    message = "هذا المسار متاح لحسابات العيادات فقط"

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and getattr(user, 'user_type', '') == 'clinic_staff'
        )
