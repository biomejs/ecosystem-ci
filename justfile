set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

default:
	@just --list

install:
	pnpm install

lint:
	pnpm run lint

test:
	pnpm run test

check:
	pnpm run check

build:
	pnpm run build

ci: lint test check build

dev *args:
	pnpm --dir dashboard exec vite dev --host {{args}}

reports-download *args:
	pnpm --dir dashboard exec tsx scripts/download-r2.ts {{args}}

reports-import *args:
	pnpm --dir dashboard exec tsx scripts/import-ci-runs.ts {{args}}

reports-diagnostics *args:
	pnpm --dir dashboard exec tsx scripts/read-diagnostics.ts {{args}}

db-migrate-local:
	pnpm --dir dashboard run db:migrate:local

db-migrate-remote:
	pnpm --dir dashboard run db:migrate:remote

db-seed-local:
	pnpm --dir dashboard run db:seed:local

db-setup-local:
	pnpm --dir dashboard run db:setup:local

deploy:
	pnpm run deploy
