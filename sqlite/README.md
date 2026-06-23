# SQLite local runtime

SQLite is the Docker-free local storage mode for single-user automation runs.
The default database file is:

```text
sqlite/data/wb_niche_analysis.sqlite
```

Initialize the schema:

```bash
pnpm run sqlite:init
```

Run the automation flows against SQLite:

```bash
HEADLESS=false pnpm run niche-report:sqlite
HEADLESS=false pnpm run niche-query-stats:sqlite
HEADLESS=false pnpm run compare-cards:sqlite
```

Inspect local table counts:

```bash
pnpm run sqlite:inspect
```

Clear local data while preserving the schema:

```bash
pnpm run sqlite:reset
```

The SQLite file and WAL/SHM sidecar files are local runtime artifacts and should
not be committed.
