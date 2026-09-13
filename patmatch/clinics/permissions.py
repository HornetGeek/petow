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


class IsPlatformAdmin(BasePermission):
    """Allow only platform super admins to access platform administration APIs."""

    message = "هذا المسار متاح لمشرفي المنصة فقط"

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and user.is_staff
            and user.is_superuser
        )
