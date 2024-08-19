# Ecosystem CI

This repository is used to run integration tests for Biome.
Every integration test checkout a project that uses Biome and test Biome against it.

## Execution

Integration tests are scheduled to run automatically every Monday, Wednesday and Friday.
You can also [manually execute the tests](https://github.com/biomejs/ecosystem-ci/actions/workflows/ecosystem-ci.yml) if you have the required permissions.
This is specifically useful to test if a Pull Request introduces or fixes a regression.

Failure and successes are reported on the [github-ecosystem-ci](https://discord.com/channels/1132231889290285117/1275181107318362153) channel on the Biome's Discord.
