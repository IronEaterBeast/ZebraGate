create policy "ai_call_traces_service_role_all"
  on public.ai_call_traces
  for all
  to service_role
  using (true)
  with check (true);

create policy "ai_call_trace_events_service_role_all"
  on public.ai_call_trace_events
  for all
  to service_role
  using (true)
  with check (true);
