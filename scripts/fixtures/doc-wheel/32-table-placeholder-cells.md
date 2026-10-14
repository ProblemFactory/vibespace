# Golden-file adjudication — import run 7

The 14 flagged rows (13 + R009) collapse into 6 distinct gold errors.

## Every GOLD_WRONG row (mechanical)

'Source-supported value' is the majority's value. 'Readers' counts how many of the 3 verdicts chose it. The 'quote' column gives the deciding passage and the file it is in. Source paths are `ledger-api/tests/imports/golden_cases/<case>/source.txt`.

| row | case | field | money | gold value | source-supported value | readers | agreement | reason | deciding quote (file) |
|---|---|---|---|---|---|---|---|---|---|
| R003 | harbor-lease | `terms.deposit_months.count` | yes | 3 | 2 | 3/3 | 1.0/1.0/0.9 | the gold copied the draft, not the signed text | harbor-lease §4 "The Tenant shall pay a deposit equal to two (2) months of rent" + §4.2 "…returned within thirty (30) days of the end of the term, less any amount owed" (source.txt) |
| R007 | maple-loan | `fees.late_tiers[all#2]` | yes | present | <absent> | 2/3 | 0.7/0.6/0.65 | (a) the second tier is in the 2024 schedule only; (b) the 2026 text has one tier | maple-loan §7.3 "A late fee of US $25.00 applies after ten (10) days" — the schedule names no second tier (source.txt) |
| R009 | cedar-nda | `term.survival_years` | no | 5 | <absent> | 3/3 | 0.9/0.9/0.8 | the clause names no survival period | cedar-nda §9 "Obligations under this Agreement end when this Agreement ends, unless a written notice says otherwise" (source.txt) |
| R012 | birch-msa | `pricing.unit_price.amount` | yes | $1,200.00 | $1,250.00 | 3/3 | 1.0/0.95/0.9 | the gold kept the superseded rate | birch-msa Order Form 2 "unit price: US $1,250.00 per seat per year, billed annually in advance" (source.txt) |

Rows R003 and R012 move money; R007 and R009 drop a field the source never states.
