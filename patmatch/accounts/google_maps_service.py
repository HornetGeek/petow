import logging
import os
import time
from typing import Any, Dict, List, Optional

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

GOOGLE_MAPS_BASE_URL = "https://maps.googleapis.com/maps/api"


class GoogleMapsServiceError(Exception):
    def __init__(self, message: str, *, status_code: int = 502, code: str = "google_maps_error"):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code


class GoogleMapsService:
    def __init__(
        self,
        api_key: Optional[str] = None,
        timeout: int = 6,
        max_retries: int = 1,
        backoff_seconds: float = 0.35,
    ):
        resolved_key = (
            api_key
            or getattr(settings, "GOOGLE_MAPS_SERVER_API_KEY", "")
            or os.environ.get("GOOGLE_MAPS_SERVER_API_KEY", "")
        )
        self.api_key = (resolved_key or "").strip()
        self.timeout = timeout
        self.max_retries = max(0, int(max_retries))
        self.backoff_seconds = max(0.0, float(backoff_seconds))

        if not self.api_key:
            raise GoogleMapsServiceError(
                "Google Maps server key is not configured",
                status_code=503,
                code="google_maps_not_configured",
            )

    def _sleep_with_backoff(self, attempt_index: int) -> None:
        if self.backoff_seconds <= 0:
            return
        # lightweight backoff to smooth transient upstream/network spikes
        time.sleep(self.backoff_seconds * (attempt_index + 1))

    def _request(self, endpoint: str, params: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{GOOGLE_MAPS_BASE_URL}{endpoint}"
        request_params = dict(params)
        request_params["key"] = self.api_key

        response: Optional[requests.Response] = None
        last_exc: Optional[Exception] = None

        for attempt in range(self.max_retries + 1):
            try:
                response = requests.get(url, params=request_params, timeout=self.timeout)
            except requests.Timeout as exc:
                last_exc = exc
                logger.warning(
                    "Google Maps request timeout on attempt %s/%s: %s",
                    attempt + 1,
                    self.max_retries + 1,
                    exc,
                )
                if attempt < self.max_retries:
                    self._sleep_with_backoff(attempt)
                    continue
                raise GoogleMapsServiceError(
                    "Google Maps request timed out",
                    status_code=504,
                    code="google_maps_timeout",
                )
            except requests.RequestException as exc:
                last_exc = exc
                logger.error(
                    "Google Maps upstream request failed on attempt %s/%s: %s",
                    attempt + 1,
                    self.max_retries + 1,
                    exc,
                )
                if attempt < self.max_retries:
                    self._sleep_with_backoff(attempt)
                    continue
                raise GoogleMapsServiceError(
                    "Unable to reach Google Maps service",
                    status_code=502,
                    code="google_maps_upstream_unavailable",
                )

            if response.status_code >= 500 and attempt < self.max_retries:
                logger.warning(
                    "Google Maps returned %s on attempt %s/%s, retrying",
                    response.status_code,
                    attempt + 1,
                    self.max_retries + 1,
                )
                self._sleep_with_backoff(attempt)
                continue
            break

        if response is None:
            logger.error("Google Maps request failed without response: %s", last_exc)
            raise GoogleMapsServiceError(
                "Unable to reach Google Maps service",
                status_code=502,
                code="google_maps_upstream_unavailable",
            )

        try:
            payload = response.json()
        except ValueError:
            logger.error("Google Maps upstream returned non-JSON response (status=%s)", response.status_code)
            raise GoogleMapsServiceError(
                "Invalid response from Google Maps service",
                status_code=502,
                code="google_maps_invalid_response",
            )

        status_value = payload.get("status")

        if response.status_code >= 500:
            raise GoogleMapsServiceError(
                "Google Maps service error",
                status_code=502,
                code="google_maps_upstream_error",
            )

        if status_value in {"OK", "ZERO_RESULTS"}:
            return payload

        if response.status_code == 429 or status_value in {"OVER_QUERY_LIMIT", "OVER_DAILY_LIMIT"}:
            raise GoogleMapsServiceError(
                "Google Maps quota exceeded",
                status_code=429,
                code="google_maps_quota_exceeded",
            )

        if status_value == "REQUEST_DENIED":
            raise GoogleMapsServiceError(
                payload.get("error_message") or "Google Maps request denied",
                status_code=403,
                code="google_maps_request_denied",
            )

        if status_value in {"INVALID_REQUEST", "NOT_FOUND"}:
            raise GoogleMapsServiceError(
                "Google Maps request is invalid",
                status_code=400,
                code="google_maps_invalid_request",
            )

        error_message = payload.get("error_message") or "Google Maps request failed"
        raise GoogleMapsServiceError(
            str(error_message),
            status_code=502,
            code="google_maps_unknown_error",
        )

    def autocomplete(
        self,
        *,
        query: str,
        language: str = "ar",
        session_token: Optional[str] = None,
    ) -> Dict[str, List[Dict[str, Any]]]:
        params: Dict[str, Any] = {
            "input": query,
            "language": language,
            "types": "geocode",
        }
        if session_token:
            params["sessiontoken"] = session_token

        payload = self._request("/place/autocomplete/json", params)
        predictions = payload.get("predictions") or []

        normalized = []
        for item in predictions:
            place_id = item.get("place_id")
            description = item.get("description")
            if not place_id or not description:
                continue
            formatted = item.get("structured_formatting") or {}
            normalized.append(
                {
                    "place_id": place_id,
                    "description": description,
                    "main_text": formatted.get("main_text"),
                    "secondary_text": formatted.get("secondary_text"),
                }
            )

        return {"predictions": normalized}

    def geocode_place(self, *, place_id: str, language: str = "ar") -> Dict[str, Any]:
        payload = self._request(
            "/geocode/json",
            {
                "place_id": place_id,
                "language": language,
            },
        )

        results = payload.get("results") or []
        if not results:
            raise GoogleMapsServiceError(
                "No geocoding result for selected place",
                status_code=404,
                code="google_maps_not_found",
            )

        first = results[0]
        location = ((first.get("geometry") or {}).get("location") or {})
        lat = location.get("lat")
        lng = location.get("lng")

        if lat is None or lng is None:
            raise GoogleMapsServiceError(
                "Geocoding result is missing coordinates",
                status_code=502,
                code="google_maps_invalid_response",
            )

        return {
            "address": first.get("formatted_address") or f"{lat:.6f}, {lng:.6f}",
            "lat": float(lat),
            "lng": float(lng),
        }

    def reverse_geocode(self, *, lat: float, lng: float, language: str = "ar") -> Dict[str, Any]:
        payload = self._request(
            "/geocode/json",
            {
                "latlng": f"{lat},{lng}",
                "language": language,
            },
        )

        results = payload.get("results") or []
        if not results:
            return {
                "address": f"{lat:.6f}, {lng:.6f}",
                "lat": float(lat),
                "lng": float(lng),
            }

        first = results[0]
        geometry = first.get("geometry") or {}
        location = geometry.get("location") or {}

        resolved_lat = float(location.get("lat", lat))
        resolved_lng = float(location.get("lng", lng))

        return {
            "address": first.get("formatted_address") or f"{resolved_lat:.6f}, {resolved_lng:.6f}",
            "lat": resolved_lat,
            "lng": resolved_lng,
        }
