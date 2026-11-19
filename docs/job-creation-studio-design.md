# BRIGHTWAY — Job Vacancy Creation Studio

**Canonical Job Vacancy UI/UX reference (November 2026).**

This replaces all earlier **Job Vacancy creation layout and visual treatment**. Earlier opportunity-layout documents remain relevant to Scholarships, Challenges and Events only. The approved Job Vacancy field schema, validations, permissions and publishing contracts remain in force.

## Product experience

Job creation should feel like a purpose-built recruitment product, not a generic modal filled with fields.

### Large desktop (1280px and wider)

- Full-viewport publishing workspace: separate from the surrounding organization dashboard.
- Three regions: approximately **222px step navigator**, a fluid **primary form up to 795px**, and a **328px candidate preview**.
- The form owns the visual hierarchy: meaningful section headings, short explanations, clear controls, generous whitespace, and progressive disclosure of advanced options.
- Header shows the opportunity context and an always-accessible close action.
- Footer keeps Back/Continue or Back/Save draft/Publish accessible while the form content scrolls.

### Smaller desktop/tablet (901–1279px)

- Two-column step navigator plus primary form.
- Candidate preview becomes an on-demand side drawer, accessible through a prominent preview control.
- Opening and closing the preview does not change the form's draft state.

### Mobile (900px and below)

- Single-column, form-first publishing experience. The vertical navigation rail is removed.
- Progress is shown as a readable **Step X of 4** label and progress bar.
- Optional candidate preview is a dismissible drawer with Escape handling and keyboard focus returning to the trigger.
- Touch targets are 44px or larger. On narrow phones, Publish becomes a full-width final action.

## Journey and field organization

1. **Job Details:** role title and overview; multi-select job categories and types; work arrangement and location; optional 16:9 cover image; optional vacancy count and start date.
2. **Pay & Requirements:** compensation type, fixed/range and negotiability; seniority and experience duration; education and fields of study; skills and responsibilities; advanced qualifications.
3. **Applications:** closing deadline, required/optional document status, additional questions and optional recruitment settings.
4. **Review & Publish:** coherent final review, save draft and direct publication actions.

Use searchable multi-selection with visible, removable tokens for categories/types rather than hiding selections in a comma-separated value.

## Candidate preview

- Compact, genuine listing card, not a large decorative placeholder.
- Reflect the publisher's **actual organization name**, title, location, work arrangement, selected job type, experience level, description excerpt, salary (when set), and deadline.
- Display the optional cover at **16:9** with centered object-fit cropping.
- When absent, show the native BrightWay graphic; do not insert unrelated stock photography.
- The preview updates immediately from the local React draft and never causes a network save.
- The simulated Apply Now affordance inside the preview is display-only until publication.

## Visual system

- BrightWay black/white and restrained neutral grays; color should signify action or status, not dominate the canvas.
- Large stage titles, 13px field labels, 14px values, 12px contextual help.
- Inputs approximately 47px high with clear focus outlines and sufficient contrast.
- Section cards have restrained borders, small shadows and 14–16px rounding; avoid heavy background gradients.
- Cover upload remains in **Job Details** and is never hidden inside Advanced options.

## Non-regression contract

- Preserve all approved field keys and conditional business rules; do not silently introduce required questions.
- Preserve session draft recovery, payload shape, document automation, create/edit/publish permissions and existing endpoints.
- Users can revisit completed steps without skipping validation for future steps.
- No accidental changes to Scholarships, Events, Challenges or the Virtual Campus.
- Validate both desktop and mobile using existing Playwright opportunity journeys, frontend unit tests, lint, build, and backend/database integration checks.

## Implementation

- `frontend/src/components/opportunities/JobCreationStudio.jsx`
- `frontend/src/components/opportunities/job-creation-studio.css`
- `frontend/src/components/opportunities/JobVacancySteps.jsx`
- `frontend/src/components/opportunities/OpportunityEditor.jsx`
