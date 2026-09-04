# Ecosystem CI

This repository is used to run integration tests for Biome.
Every integration test checkout a project that uses Biome and test Biome against it.
Each project's check runs five times in a row. Every repetition records a timing sample (check duration and scanner duration), and the last report written is the one that gets published, so timing can be reasoned about statistically instead of from one measurement.

## Execution

Integration tests are scheduled to run automatically every Monday, Wednesday and Friday.
You can also [manually execute the tests](https://github.com/biomejs/ecosystem-ci/actions/workflows/ecosystem-ci.yml) if you have the required permissions.
This is specifically useful to test if a Pull Request introduces or fixes a regression.

Failure and successes are reported on the [github-ecosystem-ci](https://discord.com/channels/1132231889290285117/1275181107318362153) channel on the Biome's Discord.

## Dashboard

The SvelteKit dashboard is a pnpm workspace in [`dashboard/`](dashboard/). Run it from the repository root:

```sh
corepack enable
pnpm install
just dev
```

Run `just ci` to lint, test, type-check, and build the project.

### Deployment

The dashboard and ingestion Worker are separate pnpm workspaces in [`dashboard/`](dashboard/) and [`ingest/`](ingest/). `just deploy` deploys both. The ingestion Worker consumes the `ecosystem-ci-ingest` queue and accepts workflow uploads using the `UPLOAD_TOKEN` Worker secret. The same value must be stored in the GitHub repository as `ECOSYSTEM_CI_UPLOAD_TOKEN`.

R2 must notify the queue for object creation under the `incoming/runs/` prefix with the `/manifest.json` suffix in `biome-ecosystem-ci-reports`. The consumer writes the latest run attempt to D1, copies the manifest into its canonical run folder, and removes the incoming copy.

### Reading raw diagnostics

Use `reports:diagnostics` to read diagnostics from the reports in `dashboard/data/reports`. Pass a report id or repository slug. The command reads the newest run unless you pass `--run`.

```sh
just reports-diagnostics astro
just reports-diagnostics astro --severity error --category lint
just reports-diagnostics withastro/astro --run 33613560701 --path packages
```

The command prints at most 100 matching diagnostics by default. Pass `--all` to print all of them, `--json` for JSON, or `--help` for every filter.
