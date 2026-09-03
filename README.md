# Ecosystem CI

This repository is used to run integration tests for Biome.
Every integration test checkout a project that uses Biome and test Biome against it.

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

### Reading raw diagnostics

Use `reports:diagnostics` to read diagnostics from the reports in `dashboard/data/reports`. Pass a report id or repository slug. The command reads the newest run unless you pass `--run`.

```sh
just reports-diagnostics astro
just reports-diagnostics astro --severity error --category lint
just reports-diagnostics withastro/astro --run 33613560701 --path packages
```

The command prints at most 100 matching diagnostics by default. Pass `--all` to print all of them, `--json` for JSON, or `--help` for every filter.
