FAA JASC / ATA import package

Source: https://sdrs.faa.gov/documents/JASC_Code.pdf
FAA source title: Joint Aircraft System/Component Code Table and Definitions
Source last updated: 2008-10-27
Parsed JASC rows: 547
ATA chapter slots included: 100 (00 through 99)

Files:
- jasc_codes_full.csv: Four-digit FAA JASC codes, ATA chapter mapping, definitions, heuristic aircraft applicability flags.
- ata_chapters_00_99.csv: ATA chapter slots 00-99 with count of FAA JASC rows.
- schema_jasc_ata.sql: Suggested database schema and work-order cross-reference table.
- jasc_ata_reference.xlsx: Same data in workbook form.

Important: aircraft applicability flags are broad UI/filtering defaults. Always allow per-aircraft/manual overrides. FAA JASC is public FAA reference; proprietary ATA iSpec 2200 data may require licensing.
