# Ecosystem CI

Ecosystem CI measures how a Biome branch behaves across customer repositories. Its language distinguishes an executed run from the repository observations collected during that run.

## Language

**Run**:
One execution of Ecosystem CI against a Biome branch and commit. Rerunning the same workflow updates the run rather than creating a separate historical attempt.

**Biome branch**:
A named branch in the Biome repository. Runs on the same Biome branch form a continuous history even as its commit changes.
_Avoid_: Ref, target branch

**Customer repository**:
A repository configured to be checked with Biome. Its identity is its repository slug, such as `dyc3/opentogethertube`.
_Avoid_: Project, target

**Repository result**:
The observations collected for one customer repository during one run. No repository result exists when no report was received.
_Avoid_: Project result, target result

**Repository trend**:
A customer repository's results over runs from the same Biome branch. Runs from different branches do not form one trend.

**Branch comparison**:
A repository-by-repository comparison between two runs. A customer repository can be compared only when both runs contain its result.

**Diagnostic count**:
A repository-level total grouped by diagnostic kind, severity, and category. It does not represent an individual diagnostic or source file.

**Rule diagnostic**:
A diagnostic attributed to a Biome rule.

**Parse diagnostic**:
A diagnostic produced while Biome parses source code.

**Panic**:
An internal Biome failure observed while checking a customer repository. Panics are counted without assigning a persistent identity to each failure.

**Migration outcome**:
The result of running Biome's migration before checking a customer repository. It distinguishes migrations that were not run, failed, succeeded without changes, or succeeded with changes.

**Missing repository data**:
The absence of a repository result from a run. Missing data is not a result, failure, or comparable observation.
_Avoid_: Missing result
