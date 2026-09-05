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

The SvelteKit dashboard is a pnpm workspace in [`dashboard/`](dashboard/). Local development uses an emulated D1 database and R2 bucket. Download report artifacts, seed the local storage, then start the dashboard.

### Local setup

Install Node.js 24, Corepack, `just`, Git, and `unzip`. Run the following commands from the repository root.

1. Install dependencies:

   ```sh
   corepack enable
   pnpm install
   ```

2. Download reports from either R2 or GitHub Actions.

   For R2, install the AWS CLI and configure [R2 access credentials](https://developers.cloudflare.com/r2/examples/aws/aws-cli/) with read access to `biome-ecosystem-ci-reports`. Use `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`, or an AWS profile selected with `AWS_PROFILE`. Then download specific GitHub Actions run IDs:

   ```sh
   just reports-download <run-id> [<another-run-id>]
   ```

   Omit the IDs to download all published runs. The command uses the Cloudflare account configured for this repository; set `CLOUDFLARE_ACCOUNT_ID` to override it.

   Alternatively, download retained GitHub Actions artifacts:

   ```sh
   just reports-import --no-seed
   ```

   The GitHub importer finds completed runs from the last 10 days in `biomejs/ecosystem-ci`. To select specific runs, append their numeric run IDs. For authentication, set `GITHUB_TOKEN` or `GH_TOKEN`, or sign in with `gh auth login`. Runs must still have unexpired report artifacts. The importer preserves target metadata when that artifact is available; otherwise it reconstructs metadata from workflow jobs and uses each report's summary as a single timing sample.

   Both commands save run folders under `dashboard/data/runs/`, using the production R2 layout:

   ```text
   runs/<run-id>/attempts/<attempt>/
     manifest.json
     reports/<owner>/<repository>.json
   ```

   Each attempt carries its own run metadata. Seeding and diagnostics discover these folders directly; `dashboard/data/manifest.json` is no longer used. If you have downloads in the old `dashboard/data/reports/` layout, download them again with one of the commands above.

3. Apply migrations and seed local D1 and R2:

   ```sh
   just db-setup-local
   ```

   Seeding uses the latest downloaded attempt for each run and the same ingestion code as production. It copies raw reports into local R2 and updates D1 with run results, timing samples, and diagnostic counts. Missing reports remain absent. Previously seeded runs stay in D1 unless a newer attempt replaces them.

4. Start the dashboard:

   ```sh
   just dev
   ```

   Open the local URL printed by Vite.

To refresh from R2, download again and run `just db-setup-local`. For GitHub, `just reports-import` downloads new runs, applies migrations, and seeds automatically. Run `just db-seed-local` to reseed existing downloads without applying migrations.

Run `just ci` to lint, test, type-check, and build the project.

### Deployment

The dashboard and ingestion Worker are separate pnpm workspaces in [`dashboard/`](dashboard/) and [`ingest/`](ingest/). `just deploy` deploys both. The ingestion Worker consumes the `ecosystem-ci-ingest` queue and accepts workflow uploads using the `UPLOAD_TOKEN` Worker secret. The same value must be stored in the GitHub repository as `ECOSYSTEM_CI_UPLOAD_TOKEN`.

R2 must notify the queue for object creation under the `incoming/runs/` prefix with the `/manifest.json` suffix in `biome-ecosystem-ci-reports`. The consumer writes the latest run attempt to D1, copies the manifest into its canonical run folder, and removes the incoming copy.

### Reading raw diagnostics

Use `reports:diagnostics` to read diagnostics from the reports in `dashboard/data/runs`. Pass a report id or repository slug. The command reads the newest run unless you pass `--run`.

```sh
just reports-diagnostics astro
just reports-diagnostics astro --severity error --category lint
just reports-diagnostics withastro/astro --run 33613560701 --path packages
```

The command prints at most 100 matching diagnostics by default. Pass `--all` to print all of them, `--json` for JSON, or `--help` for every filter.
