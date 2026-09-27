-- ============================================================================
-- ProofPod — AC Commissioning: add a "full" certificate type (one combined
-- document with everything — system, pressure test, evacuation, charge,
-- commissioning, temperatures, drain test and F-Gas figures — instead of
-- picking one of the 5 separate documents).
--
-- New enum values can't be used in the same transaction they're added in,
-- so this is its own migration; 0018 updates issue_ac_certificate to use it.
-- Run after 0001-0016.
-- ============================================================================

alter type ac_doc_type add value if not exists 'full';
