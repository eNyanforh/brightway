# BrightWay Opportunities — creation UI/UX specification

> **Job Vacancy UI/UX superseded:** The Job creation design in this document is retired. Use [Job Vacancy Creation Studio](./job-creation-studio-design.md) as the canonical Job UI/UX reference. This document remains a reference for other opportunity types.


**Implementation reference:** November 2026.
**Scope:** Job Vacancy, Scholarship, Challenge and Event creation. Existing approved business fields, application rules, and API contracts must remain intact.

## Desktop layout (1025px and wider)

- A publishing editor, maximum 1320px wide; height up to 96dvh with a cap of 980px.
- Persistent header: context, editor title, concise step description, 44px accessible close control.
- Guided forms: step navigator below the header; the current step is prominent, previous steps are selectable, future steps are disabled.
- Main content: live listing preview on the LEFT, form on the RIGHT. Approximate layout ratio 42:58 and a maximum 48px gap.
- Only the content region scrolls; navigation and footer remain visible.
- Footer keeps Back/Cancel and Continue or Save/Publish actions accessible.

## Tablet layout (721–1024px)

- One-column form with preview hidden by default behind an accessible preview toggle.
- All fields preserve their values when the preview is opened or closed.
- Inputs use the same visual hierarchy and section grouping as desktop.

## Mobile layout (up to 720px)

- Editor occupies the entire available viewport (100dvh), with 18px horizontal content padding.
- Fields stack in one column. The step navigator scrolls horizontally rather than compressing labels.
- Bottom action bar remains present, with at least 48px-high buttons and safe-area padding.
- Preview opens above the form when requested; a collapsed preview must not consume the mobile screen.

## Field groups, typography, and rhythm

| Element | Specification |
|---|---|
| Standard input height | 46px minimum |
| Field labels | 13px semibold |
| Within-section gap | 12px |
| Paired-field gap | 16px |
| Major section padding | 22px top / 24px bottom |
| Input radius | 10px |
| Preview card radius | 14px |
| Form step heading | 22–30px |
| Helper text | 12–13px |
| Visual style | BrightWay black, white, and neutral gray |

Keep fields in their already-approved functional groups, and show conditional fields only when applicable. Optional advanced settings remain collapsed by default. Job cover upload is in Job Details, not Advanced options.

## Background photo and live preview

- Preview artwork is **16:9**, never square. Render images with object-fit: cover and a centered crop rather than stretching.
- Recommend uploads of 1280 by 720 pixels or greater (1600 by 900 preferred); preserve current JPEG, PNG, WebP and 5 MB file requirements.
- Do not reject already uploaded square/portrait images solely because of aspect ratio; use centered cropping in the preview.
- Display a realistic listing card with title, description excerpt, opportunity category, and relevant location/format or deadline metadata.
- Job and Scholarship side facts display compensation or funding, plus location and deadline.
- Draft state drives the preview immediately, without an extra API request. The fallback uses existing BrightWay poster artwork.
- The mobile preview toggle uses aria-expanded and aria-controls and never submits the form.

## Job Vacancy journey

**Opportunity type → Job Details → Pay & Requirements → Applications → Review & Publish.**

Preserve all existing fields: title, description, categories, job types, work arrangement, location, vacancies, start date; compensation, negotiability, qualifications, experience, education, skills and responsibilities; deadline, documents, optional questions and recruitment settings; final draft save or publication.

Other opportunity types retain their already-approved creation workflows and fields but share the same editor styling and image presentation.

## Acceptance criteria for merge

1. No change to opportunity persistence, database schema, permitted application documents, publisher authorization, or application rules.
2. Input values survive moving between completed steps and opening/closing the mobile preview.
3. Future steps cannot be selected before completing the previous step.
4. Validate 320, 375, 768, 1024, 1280 and 1440 pixel widths without horizontal overflow or trapped controls.
5. Keyboard navigation, visible focus, accessible labels, dialog Escape handling and submission errors continue functioning.
6. Check Job, Scholarship, Challenge and Event creation, draft save, cover upload and publish paths.
7. Run frontend unit tests, build, and desktop/mobile browser acceptance checks before merging; a pushed commit alone does not constitute completion.

## Implementation files

- frontend/src/components/opportunities/OpportunityEditor.jsx: editor shell and step navigation.
- frontend/src/components/opportunities/DedicatedOpportunityWizard.jsx: Job/Scholarship preview.
- frontend/src/components/opportunities/StandardOpportunityComposer.jsx: Event preview.
- frontend/src/components/opportunities/ChallengeComposer.jsx: Challenge preview.
- frontend/src/components/opportunities/opportunity-creation-layout.css: shared responsive visual treatment.
