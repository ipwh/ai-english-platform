# Writing Golden Dataset — Human-Marker Calibration Fixtures

## Purpose
Reserved for future human-marker calibration of the AI writing evaluation pipeline.

## Status
NO official HKEAA scores exist in this dataset.
All `expected` scores are `null` — awaiting human-marker annotation.

## Fixture Format
Each JSON file:
```json
{
  "id": "sample-01",
  "task": "The writing task prompt shown to the student.",
  "studentDraft": "The student's actual essay text.",
  "textType": "article|letter|speech|essay",
  "expected": {
    "contentBand": null,
    "languageBand": null,
    "organizationBand": null
  },
  "notes": "Reserved for human-marker calibration."
}
```

## Usage
1. Human markers annotate `expected.contentBand`, `expected.languageBand`, `expected.organizationBand` (0-7 each).
2. Run `analyzeWriting()` against each fixture.
3. Compare AI scores vs human scores.
4. Track drift across rubric/prompt versions using `rubricVersion` metadata.

## IMPORTANT
- Do NOT fabricate official HKEAA scores.
- Do NOT claim these are official HKEAA grades.
- These are platform-internal calibration fixtures only.
