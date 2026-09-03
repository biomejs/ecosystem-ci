---
status: accepted
date: 2026-09-03
---

# Ingest run manifests through R2 and Queues

Ecosystem CI will ingest every completed, non-skipped workflow run attempt that produces at least one raw report, including scheduled, manual, and candidate-branch runs. A final GitHub Actions job is the sole publisher. It uses an authenticated, ingestion-specific Worker endpoint to upload immutable raw reports to R2 first, then uploads the run manifest under an incoming prefix as the publication signal. The endpoint's credential cannot administer the Cloudflare account.

Each run attempt has its own R2 namespace:

```text
runs/<run-id>/attempts/<attempt>/
  reports/<owner>/<repository>.json
  manifest.json

incoming/runs/<run-id>/attempts/<attempt>/manifest.json
```

The manifest contains run metadata and a `targets` map keyed by the full GitHub repository slug. Each target contains metadata that cannot be derived from its raw report. The manifest does not inventory report objects. The consumer lists the attempt's `reports/` prefix, derives each repository slug from its object key, and joins the report to the corresponding target metadata. An absent report remains absent and produces no repository result.

An R2 object-create notification for incoming manifests sends one message per published attempt to a Cloudflare Queue. The consumer writes the run, its repository results, and diagnostic counts to D1. It updates a run only when the attempt is newer than the stored attempt. After the D1 write succeeds, the consumer copies the incoming manifest to the attempt's canonical folder, deletes the incoming object, and acknowledges the message. Processing is idempotent because queue messages can be delivered more than once and an R2 move is a copy followed by a delete.

R2 retains every attempt, while D1 exposes only the latest attempt for each run. The automated ingestion path processes only attempts published to the queue after this mechanism is enabled. It will not backfill the current local manifest or retained GitHub artifacts.

## Considered options

We rejected notifications for individual reports because they provide no reliable completion signal for a run attempt. We rejected listing report paths in the manifest because R2 can list the attempt folder and missing reports are deliberately represented by absence. We also rejected the current mutable local manifest as a production input because it is a development import index rather than an immutable publication record.

## Consequences

A canonical attempt folder contains the metadata and raw reports needed to rebuild its D1 projection. Pending and accepted manifests occupy different prefixes, but D1 remains the authority on whether ingestion succeeded because promotion is not atomic. Stale attempt messages cannot replace newer D1 observations. Historical data remains absent unless it is deliberately published through the queue in the future.
