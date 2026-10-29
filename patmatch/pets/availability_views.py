from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied

from .availability import CHECKABLE, check_data, enabled_for_owner, respond
from .models import Pet
from .serializers import PetSerializer


class AvailabilityAnswerSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=['confirm', 'arranging', 'complete', 'status', 'later'])
    expected_status = serializers.CharField(max_length=30)
    status = serializers.ChoiceField(choices=['available', 'available_for_adoption', 'mating', 'pregnant', 'unavailable', 'adopted'], required=False)
    request_id = serializers.IntegerField(min_value=1, required=False)

    def validate(self, attrs):
        if attrs['action'] == 'complete' and 'request_id' not in attrs:
            raise serializers.ValidationError({'request_id': 'An approved adoption request is required.'})
        if attrs['action'] == 'status' and 'status' not in attrs:
            raise serializers.ValidationError({'status': 'Choose the new pet status.'})
        return attrs


class AvailabilityChecksView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        enabled = enabled_for_owner(request.user.pk)
        checks = []
        if enabled:
            now = timezone.now()
            for pet in Pet.objects.filter(owner=request.user, status__in=CHECKABLE).order_by('id'):
                if pet.availability_prompt_after and pet.availability_prompt_after > now:
                    continue
                data = check_data(pet, now)
                if data['due']:
                    checks.append(data)
        return Response({'enabled': enabled, 'checks': checks})


class PetAvailabilityView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        pet = get_object_or_404(Pet, pk=pk, owner=request.user)
        return Response({'enabled': enabled_for_owner(request.user.pk), 'check': check_data(pet)})

    def post(self, request, pk):
        if not enabled_for_owner(request.user.pk):
            raise PermissionDenied('Availability checks are not enabled for this account yet.')
        answer = AvailabilityAnswerSerializer(data=request.data)
        answer.is_valid(raise_exception=True)
        with transaction.atomic():
            pet = get_object_or_404(Pet.objects.select_for_update(), pk=pk, owner=request.user)
            respond(pet, answer.validated_data)
            return Response(PetSerializer(pet, context={'request': request}).data)
