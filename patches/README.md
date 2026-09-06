# Project patches

Patches are a last resort for fixing failures. When Biome fails to run on a project, investigate it as
a likely Biome bug first. Catching those bugs is the purpose of ecosystem CI;
patching the project to hide a Biome bug defeats that purpose.

Patches can also add minimal Biome configuration to projects that do not already
use Biome, so ecosystem CI can test them.

Store patches as `patches/<project-id>.patch` and set `patch` on the
project's matrix entry in `.github/workflows/ecosystem-ci.yml`:

```yaml
- id: cline
  repository: cline/cline
  ref: 48d63852745460ff0fa3dfcc0457bbe2493841de
  patch: patches/cline.patch
```

Create a patch against the project's pinned `ref`. From a clean checkout of that
project, make the compatibility edits, then run:

```sh
git add -- path/to/changed-file path/to/new-file
git diff --cached --binary > /path/to/ecosystem-ci/patches/<project-id>.patch
```

Patch paths must be relative to the target repository root, even when the matrix
sets `working-directory`. If the project uses a sparse checkout, the patched files
must be included in that checkout.

CI applies the patch with `git apply --index` before `biome migrate --write` and
all five check repetitions. Staging the patch keeps it out of the migration change
count. The recorded repository commit remains the upstream pinned commit.
Projects without a `patch` entry run as usual. A missing or conflicting patch
skips migration and checks for that project. CI writes an error report placeholder
and a failure outcome, and target metadata records an execution error. The job
continues so report uploads and Discord notifications still run.
The placeholder identifies `errorPhase: "patch"`, and the Discord result says
"Project patch failed; Biome was not run". The patch step's log contains Git's
error details.

For failures, only add a patch after confirming the cause is in the project itself and
cannot reasonably be resolved by fixing Biome or updating the pinned ref. Keep
the patch minimal and document why it is necessary here. Recheck patches when
updating pinned refs and remove them when upstream no longer needs the fix.

## Included patches

- `cline.patch`: sets `apps/vscode/biome.jsonc` to `root: false` so the root-level
  check can load it as a nested configuration.
- `ten-framework.patch`: corrects the doodler frontend's `extends` path to the
  repository's root `biome.json`.
- `liam.patch`: adds the required `level: "error"` to the docs application's
  `noRestrictedImports` rule, preserving its restricted import paths.
