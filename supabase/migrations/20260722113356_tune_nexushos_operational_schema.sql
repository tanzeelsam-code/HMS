set search_path to nexushos, public;

alter function nexushos.nexushos_reject_immutable_mutation()
  set search_path = nexushos, public;
alter function nexushos.nexushos_reject_workflow_request_rewrite()
  set search_path = nexushos, public;

create index if not exists idx_sessions_user_id
  on sessions(user_id);
create index if not exists idx_folio_items_reservation_id
  on folio_items(reservation_id);
create index if not exists idx_journal_lines_entry_id
  on journal_lines(entry_id);
create index if not exists idx_journal_lines_account_id
  on journal_lines(account_id);
create index if not exists idx_night_audit_postings_reservation_id
  on night_audit_postings(reservation_id);
create index if not exists idx_night_audit_postings_journal_entry_id
  on night_audit_postings(journal_entry_id);
create index if not exists idx_folio_journal_postings_journal_entry_id
  on folio_journal_postings(journal_entry_id);
create index if not exists idx_properties_organization_id
  on properties(organization_id);
create index if not exists idx_user_property_memberships_property_id
  on user_property_memberships(property_id);
create index if not exists idx_group_bookings_created_by
  on group_bookings(created_by);
create index if not exists idx_reputation_reviews_responded_by
  on reputation_reviews(responded_by);
create index if not exists idx_esg_actions_property_id
  on esg_actions(property_id);
create index if not exists idx_esg_actions_requested_by
  on esg_actions(requested_by);
create index if not exists idx_booking_quotes_reservation_id
  on booking_quotes(reservation_id);
create index if not exists idx_booking_idempotency_reservation_id
  on booking_idempotency(reservation_id);
create index if not exists idx_workflow_tasks_template_id
  on workflow_tasks(template_id);
