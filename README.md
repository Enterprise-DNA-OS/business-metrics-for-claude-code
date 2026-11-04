# Business Metrics for Claude Code

Own the definitions, numbers and decisions behind your monthly reporting. Compare results with targets, find stale figures and keep the follow-up evidence in your database.

## Three ways to own it

- **Do it yourself:** MIT-licensed base for Claude Code, Codex, OpenCode or Cursor. Hosting and agent subscriptions are separate.
- **We customise it:** Enterprise DNA maps your Tableau exports, builds your definitions and rules, connects sources and adds a web front end or a different stack when needed. One setup fee, then a retainer.
- **We run it for you:** Omni by Enterprise DNA installs the system, manages access and backups, and keeps the reporting workflow running. One setup fee, then a retainer.

[Book a 30-minute call with Sam](https://enterprisedna.co/omni/book/?offer=replace-software&utm_source=github&utm_medium=readme&utm_campaign=tableau).

## Try the synthetic demo

Node 20 or newer. No cloud service required.

```sh
npm install
npm test
npm run demo
npm run metrics -- scorecard
npm run metrics -- attention
npm run metrics -- trend SALES
npm run view
npm run docs
```

Harbour Supply and its records are invented. The seed includes two sales regions, weighted dispatch counts, excessive returns, an overdue action, stale overtime figures and a target with no actual result. Periods are relative to the run date. Repeated seeding preserves existing rows. Never seed real records. Start a fresh DATA_DIR for real work. DATABASE_URL selects PostgreSQL; otherwise PGlite persists in .data/db.

## What it does

Definitions hold the unit, calculation, direction, owner and review date. Observations preserve source keys and evidence. Targets hold an agreed value for each period and segment. Changes to targets and reviews keep before-and-after history. Actions name the owner, deadline and resolution. Monthly reports distinguish absent results from zero and show the previous observed period explicitly.

A sum adds the supplied values within one metric, month and segment. A ratio divides summed numerators by summed positive denominators and multiplies by 100. For example, 8 of 10 and 90 of 100 produce 89.0909 percent, not 85 percent. Zero denominators are rejected. Counts, currencies, hours and percentages never share a grand total. Snapshot balances and distinct counts require careful source grain and must not be loaded as overlapping additive rows.

Observations and import evidence are append-only. Corrections need a reviewed migration that preserves history. This base handles a monthly metric review; it is not a Tableau workbook engine, live connector service, interactive chart editor or staff access platform. [Why no front end](docs/why-no-front-end.md) explains that scope.

## Recurring jobs

| Command | Purpose |
|---|---|
| /help | List commands. Flags use --name=value. All commands accept --json. |
| /metrics | Metric definitions, units, owners and review dates. |
| /scorecard | Latest monthly actual and target by metric and segment. |
| /attention | Off-target, stale, missing and overdue work. |
| /trend | trend <metric>: ordered monthly results, previous period and change. |
| /variance | Off-target latest results, with actual, target and variance. |
| /sources | Source coverage, import scope and source row counts. |
| /missing-targets | Latest results without an agreed target. |
| /actions | All review actions with due date and status. |
| /compliance | Evidence and personal-information review checks. |
| /metric | metric <code or name or id-prefix>: definition, observations, targets and actions. |
| /add | add --code= --name= --unit= --kind=sum or ratio --direction=higher or lower --owner= --definition= --actor= [--personal=true --purpose= --review-on=YYYY-MM-DD] |
| /log | log <metric> --period=YYYY-MM-01 --segment= --value= --key= --evidence= --actor= [--denominator=] |
| /target | target <metric> --period=YYYY-MM-01 --segment= --value= --note= --actor=: set a target, preserving its old value in history. |
| /review | review <metric> --expected=N --next-review=YYYY-MM-DD --note= --actor= [--purpose= --owner= --definition=] |
| /action | action <metric> --code= --title= --owner= --due=YYYY-MM-DD --actor= |
| /close-action | close-action <code or title or id-prefix> --resolution= --actor= |
| /import | import tableau --metric= --file= --source= --scope= --date-column= --segment-column= --value-column= --actor= [--key-column= --denominator-column= --dry-run] |
| /export | export --out=new.json: full private snapshot, including original import data. |
| /history | history <metric>: recorded changes and decisions. |
| /weekly-review | Draft a review from attention, variance and actions. |
| /draft-variance | draft-variance <metric>: draft an evidence request from actuals and actions. |
| /customise | Add fields or rules through a tested migration. |
| /new-view | Add a branded read-only report. |

22 CLI commands and 24 slash commands. Every CLI accepts --json. Flags use --name=value. Metric selectors accept exact codes, case-insensitive names and UUID prefixes. Ambiguous names print candidates and exit 1. Source facts are never inferred from names.

## Ten questions your records answer

1. Which regions missed their sales target, and by how much? (`npm run metrics -- variance`)
2. Are our dispatch percentages weighted by the number of orders? (`npm run metrics -- scorecard`)
3. Which reported numbers are stale? (`npm run metrics -- attention`)
4. Which metrics have a target but no actual result? (`npm run metrics -- scorecard`)
5. Which actual results have no agreed target? (`npm run metrics -- missing-targets`)
6. Which segment changed most between its observed periods? (`npm run metrics -- trend SALES`)
7. Which source and filter scope produced each metric? (`npm run metrics -- sources`)
8. Which follow-up actions are overdue and who owns them? (`npm run metrics -- actions`)
9. Which personal-information metrics need a purpose or accuracy review? (`npm run metrics -- compliance`)
10. Who changed the target, and what was the previous value? (`npm run metrics -- history SALES`)

These are working queries against the supplied records, not claims that Tableau cannot answer them. A fresh demo has no target-change history until you record one.

## Your first hour: ten things to ask for

1. Put our name, logo and colours in brand.json.
2. Explain the scorecard and its units.
3. Show the missing and stale results.
4. Compare each sales region with its target.
5. Show how dispatch percentages were weighted.
6. Draft the weekly performance review.
7. Check a Tableau CSV and record its filter scope.
8. Assign an owner and date to a reporting action.
9. Add our division field through a tested migration.
10. Export a private snapshot and check its source evidence.

## Switch from Tableau

[The replace guide](docs/replace-tableau.md) gives the vendor export route and mapping. One command imports one mapped metric from a flat UTF-8 CSV, atomically. Identical batches do nothing; unchanged source rows are skipped; changed rows stop the whole batch. Extra columns and original CSV remain in the database, so remove unnecessary personal data before import. The fixture is synthetic, not a tested customer export.

Workbooks, permissions, formulas, schedules and connections need separate migration work. Reconcile every period and segment before retiring the incumbent.

## Views, paperwork and data protection

brand.json controls the business name, logo and colours. npm run view writes a monthly desk, trends and governance report. npm run docs creates metric review working papers and action briefs. These are static, escaped HTML documents for local reading or printing. Nothing sends or publishes.

Export with `npm run metrics -- export --out=exports/metrics.json`. The snapshot includes definitions, observations, targets, actions, events and original import CSV. Existing files are never overwritten. Keep native database backups too. Full restore is a reviewed maintenance operation. Protect drafts, reports and exports as carefully as the database.

All domain tables enable row-level security and remove PUBLIC grants. Use a trusted owner connection. This is not a multi-tenant permission service. Actor labels are supplied by the operator, not authenticated users. Review rules check stored evidence, not legal compliance. [Compliance sources and limits](docs/compliance.md).

## Validation and research

npm test uses a disposable database and exercises every CLI command, weighted ratios, missing data, duplicates, rollback, audit history, private exports, draft-only outputs and escaped HTML. CI covers Windows and Ubuntu on Node 20 and 22, plus PostgreSQL 16. TEST_DATABASE_URL must point to an empty disposable database. Check CI results before claiming platform verification.

[Research](docs/research.md) records candidate scores, vendor pricing, export evidence and the limits of the annual-bill scenario. [Captured demo runs](docs/demo-runs.json) show actual command output.
