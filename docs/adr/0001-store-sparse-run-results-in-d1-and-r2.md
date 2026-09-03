---
status: accepted
date: 2026-08-27
---

# Store sparse run results in D1 and R2

Ecosystem CI needs to show customer repository trends within a Biome branch and compare repositories across runs. We will store queryable run summaries and repository-level aggregates in D1, while retaining each raw report in R2. The model stays sparse: if a run produces no report for a customer repository, no repository result is stored.

## Data model

`runs` contains one row per GitHub workflow run ID. A rerun replaces the stored state for that workflow run with the latest attempt rather than preserving attempt history. Each run records the attempt number, Biome branch, resolved Biome commit SHA, lifecycle status, and start and completion timestamps.

`repository_results` contains the reports received during a run. Each row is unique by run and repository slug and records the resolved customer repository commit SHA, migration outcome, execution status, check outcome, report status, wall-clock job duration, Biome check duration, scanner duration, and the R2 object key of the raw report. A missing report produces no row.

`diagnostic_counts` contains repository-level aggregates. Each row belongs to one repository result and records a diagnostic kind of `rule`, `parse`, or `panic`, along with its severity, category, and count. Panics are counted without fingerprints. Individual diagnostics and file paths remain in the raw report.

Raw reports and D1 summaries have no automatic retention limit. The model does not store configured-but-missing repositories, ecosystem-ci configuration snapshots, persisted comparisons, or panic fingerprints.

## Query semantics

A repository trend selects repository results by repository slug and limits their runs to one Biome branch. A branch comparison joins two runs by repository slug. If either run lacks that repository result, there is no comparison for it.

## Considered options

We rejected separate workflow-attempt records because only the latest attempt matters. We also rejected placeholder rows for expected repositories because missing data is absence, not an observation. Storing every diagnostic in D1 would support file-level queries, but it adds volume and complexity that the current use cases do not need; R2 preserves that detail for later processing.

## Consequences

The database cannot distinguish a repository that was not configured from one whose report is missing. Repository slug changes create a new customer repository identity. Rebuilding diagnostic aggregates later remains possible because the raw reports are retained.

This decision supersedes the initial scaffold's `projects` and `project_results` model.
