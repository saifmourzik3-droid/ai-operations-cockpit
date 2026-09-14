# Portfolio release boundary

This repository was assembled from an explicit file allowlist with a fresh Git history. Original client-facing documents, embedded datasets, contacts, deployment configuration, API adapters, binary assets and private local configuration were excluded.

The release contains no intended credentials. `.env.example` has no populated values. Runtime setup generates fresh local credentials after checkout, and Git excludes both those credentials and runtime state. The application never uses a provider API key.

Validation covers unauthorized access, cookie flags, host/origin and CSRF checks, source-file denial, account isolation, checklist validation, request quotas, duplicate rejection, suspension, logout and expiry. Regex checks complement manual review; neither proves universal absence of secrets.

Source-code publication and live deployment are separate decisions. Keep repositories private until their owner explicitly approves public visibility and confirms the right to publish the retained code. Do not reuse production credentials when demonstrating this software.
