# Evidence and personal-information checks

Sources checked 4 November 2026. These checks support review. They do not certify compliance, authorise disclosure or decide when records must be deleted.

| Rule | Source | Check |
|---|---|---|
| NZ-IPP8 | [Privacy Commissioner principles](https://www.privacy.org.nz/resources-and-learning/knowledge-base/view/376/) and [assessment guidance](https://www.privacy.org.nz/assets/New-order/Resources-/Publications/Guidance-resources/PIA/2023-PIA-toolkit-files/PIA-Toolkit-The-privacy-principles-and-examples-of-risks-and-mitigations.pdf) | Personal metrics need a recorded review and a current review date. This is review evidence, not proof of source accuracy. |
| NZ-IPP9 | [Principle 9: retention](https://www.privacy.org.nz/privacy-principles/9/) | Personal metrics need a purpose and current review date. The principle concerns keeping information longer than needed for a lawful purpose. Review intervals are local policy, not statutory deadlines. |
| LOCAL-DEFINITION | Local reporting policy | Every metric needs an owner and definition. |
| LOCAL-EVIDENCE | Local reporting policy | Every observation needs an evidence or source-scope note. |

Run `npm run metrics -- compliance`. A clear result covers these fields only. It does not test consent, lawful collection, source accuracy, security, retention of original records, cross-border transfers or access rights. Apply the rules for your jurisdiction with your adviser.

Use aggregate data where possible. Group results can still identify a person. Unused CSV columns can contain personal information: the importer preserves them and the original CSV. Remove unnecessary columns before importing. The personal flag is declared by the operator, not detected automatically.

The demo contains an overdue personal metric with no purpose. Recording a review, a future date and a purpose clears its findings. Changing those fields does not make an unlawful use lawful. There is no automatic deletion. A retention change needs a reviewed maintenance plan covering original CSV, database backups, exports, drafts and reports.

Tables enable row-level security and revoke PUBLIC access. Use a trusted database-owner connection. These settings are not a staff permission system. Actor labels are not authenticated identities. Protect the host, database, backups and generated files. Multi-user access and audit identity are implementation work.
