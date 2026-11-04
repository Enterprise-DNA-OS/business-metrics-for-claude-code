# Move a Tableau reporting workflow

Tableau is an analytics platform, not the original system of record. Export source records wherever possible. This base replaces a monthly metric review workflow. It does not run Tableau workbooks, extracts, calculations, visualisations or connection definitions.

## Export and reconcile

[Tableau Cloud and Server help](https://help.tableau.com/current/pro/desktop/en-us/export.htm), checked 4 November 2026, documents Data downloads as CSV and Crosstab downloads as CSV or Excel. Availability depends on permissions. Select the intended sheet. Filters and selections affect the downloaded crosstab.

1. Record the site, workbook, sheet, period, filters, units and calculation definition. Export sheets separately. Remove subtotal and grand-total rows to prevent double counting.
2. Use UTF-8 CSV with one header row. Convert UTF-16 or Excel explicitly first and retain the original privately. Pivot multi-level crosstabs before import. The importer rejects null bytes and invalid UTF-8.
3. Normalise periods to YYYY-MM-01 and numbers to plain decimals without currency signs, separators or percent signs. Up to four decimal places are accepted. Excess precision is rejected, not rounded.
4. Define the metric, unit, direction and calculation. Sum inputs must be additive at their grain. Snapshot balances and distinct counts are not additive across periods or overlapping populations. Periods and segments remain separate here.
5. For ratios, export numerator and denominator counts. Results use summed numerators divided by summed denominators, multiplied by 100. Never import displayed percentages as counts. Zero denominators stop for review.
6. Reconcile row counts and results by period and segment. Review source scope and missing values. Dry-run before loading.

## One command after mapping

Define the metric first, or use SALES in a disposable demo. Start a fresh empty database for real work.

```sh
npm run metrics -- import tableau --metric=SALES --file=fixtures/tableau.csv --source=demo/site/workbook/sheet --scope="September 2026, all regions, no totals" --date-column=Month --segment-column=Region --value-column=Sales --key-column="Order ID" --actor=Pat --dry-run
```

Remove `--dry-run` to import. Each invocation loads one metric. Multiple measures require separate invocations. Add `--denominator-column=Dispatched` for a ratio whose value column holds on-time dispatches.

| Input | Destination |
|---|---|
| Metric | Existing definition, never inferred from a workbook |
| Date column | First day of the monthly period |
| Segment column | Region, team or another single dimension |
| Value column | Additive value or ratio numerator |
| Denominator column | Positive ratio denominator |
| Key column | Stable source row identifier |
| Other columns | Original row metadata, without interpretation |
| CSV, mapping, source, scope | Preserved import evidence |

Keep one stable source name for the same logical dataset. A new name represents a different dataset and can double-count facts. Never rename it to bypass a conflict. Without a key column, period plus segment is the key and must be unique. With a key, several additive rows can contribute to one period and segment.

An identical batch is a no-op. Unchanged rows in another export are skipped. A changed row stops the entire batch, including earlier valid rows. Corrections require a reviewed migration that preserves evidence and adjusts the calculation explicitly. Do not import corrected totals as additional facts.

## Separate migration work

Layouts, joins, calculated fields, parameters, credentials, permissions, schedules and visual interactions do not carry over through CSV. The fixture is synthetic and has not been validated against a customer's export. Connections, interactive charts, access controls and historical reconciliation are scoped implementation work.

One export can be mapped and reconciled in a day where access and data shape permit. Keep Tableau until required reports, totals and access needs have been verified. The one-command import is not a promise that a whole deployment moves in one day.

`npm run metrics -- export --out=exports/metrics.json` saves all records and original CSV to a new private file. Keep native database backups too. Full restore is reviewed maintenance, not an automatic command.
