-- Record the full request payload sent to the AI provider and the response
-- (or error message) received, so admins can inspect AI call history when
-- diagnosing failures such as PROVIDER_UNAVAILABLE.

alter table public.api_request_logs
  add column if not exists request_payload jsonb,
  add column if not exists response_payload jsonb,
  add column if not exists error_message text;

create index if not exists api_request_logs_created_at_idx
  on public.api_request_logs (created_at desc);
