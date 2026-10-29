# Petow backend monitoring

The Django web process and Celery workers initialize Sentry from the same settings.
Add `sentry-sdk==2.73.0` through `requirements.txt` when building the image.

Set `SENTRY_ENABLED=true` and `SENTRY_DSN` in staging and production for both web
and worker containers. Set `SENTRY_ENVIRONMENT` to `staging` or `production`, and
`SENTRY_RELEASE` to the deployed commit SHA or version. Locally and in tests,
leave `SENTRY_ENABLED=false`. `SENTRY_TRACES_SAMPLE_RATE` defaults to `0.05`;
set it between 0 and 1 to adjust transaction volume. Errors are sampled at 100%.

Every response includes `X-Request-ID`. Search Sentry events for the `request_id`
value in the `petow` context and match it with application logs. Routine expected
4xx responses are not reported. Unhandled failures are captured by Django/Celery;
handled failures need `capture_handled` at the catch boundary.

To verify without a public endpoint, use a staging shell with a temporary in-memory
Sentry transport and call `capture_handled(RuntimeError('monitoring check'),
module='monitoring', operation='verification')`. Inspect the resulting event locally,
or use a one-off staging management shell with the real DSN and remove the test issue.
Never paste a production DSN or private event payload into a ticket.
