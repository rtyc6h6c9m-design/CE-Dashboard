# Full Circle — UK Circular Economy Research Ecosystem

## → [Open the dashboard](https://rtyc6h6c9m-design.github.io/CE-Dashboard/)

An interactive map of publicly funded circular economy research in the UK: **1,640 projects**,
**£752.0M** in awards, the organisations that held them, and the outputs they produced,
covering 2006 to 2026.

Companion artefact to the dissertation *Full Circle: Mapping the UK Circular Economy
Research Ecosystem Inputs and Outputs* (Durham University, MDS Data Science, 2026).

---

## What you can do with it

| View | What it shows |
|---|---|
| **Overview** | Headline figures, funding and project counts by year, funding by funder, disciplinary mix |
| **Networks** | Institutional consortia and researcher co-authorship — pan, zoom, hover, click any node for detail |
| **Flows** | How funding travels from funder, to project discipline, to the discipline of the output produced |
| **Projects** | Every project, searchable and sortable, with partners, outputs and DOIs. Exports to CSV |
| **Methods** | How the dataset was built, and the limitations that matter before drawing conclusions |

Everything responds to one shared filter bar — search, year range, funder, discipline, lead
sector, output status. Every chart has a table view for screen readers, and the site works in
light and dark mode on any device.

## How the dataset was built

Projects were collected from UKRI's Gateway to Research API using an eighteen-term search
vocabulary, then screened with a three-tier, literature-grounded filter derived from
Kirchherr et al. (2023) and the Ellen MacArthur Foundation glossary. Screening was validated
against 100 hand-coded projects, stratified on the rule's decision: precision 0.94 and negative
predictive value 0.89, implying a recall of 0.55 at most. The rule favours precision over
coverage, so around half of the genuine CE projects it considered sit outside the corpus.

Outputs were matched from four sources — Gateway to Research, OpenAlex, Scopus and Web of
Science — by grant reference, then deduplicated into one harmonised record per outcome.
Organisations were resolved against ROR. Disciplines were assigned by a classifier with
out-of-fold accuracy 73.2% and macro-F1 0.657, the mean across 25 frozen cross-validation
splits. Predictions below a confidence of 0.503 are kept but flagged.

## Limitations worth reading first

- **The consortium network is not a map of all UK collaboration.** Partner organisations are
  reported to Gateway to Research by some funders and not others — EPSRC, BBSRC, NERC, AHRC
  and ESRC name none at all. Only 309 of 1,640 projects (18.8%) list any partner, and 208 of
  those are Innovate UK. The network is company-dominated for that reason, not because UK
  circular economy research is industry-led. The co-authorship network is the complementary
  academic view.
- **Reported output is not found output.** Innovate UK reports zero outputs to Gateway to
  Research across 612 projects, yet 845 are findable across the four sources. Every output
  figure here is the all-source merged count.
- **Award values** are missing for 346 projects (21%), 344 of them studentships that GtR funds
  through block doctoral training grants. Funding figures use the 1,294 projects that have one.
- **Named investigators** are recorded for only 385 of 1,640 projects (23.5%), in
  surname-plus-initial form, which cannot reliably distinguish individuals. They appear on
  the project record but are deliberately not searchable or networked.
- **Citation counts** shown are OpenAlex only and are missing for many publications.

The Methods page on the site states all of these in full.

## Data and licence

Project and grant data derive from [UKRI Gateway to Research](https://gtr.ukri.org/) and are
reused under the
[Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
Contains public sector information licensed under the Open Government Licence v3.0.

Bibliographic and citation data shown here come from [OpenAlex](https://openalex.org/) (CC0).

Scopus and Web of Science data are used in the underlying research but are proprietary and are
**not** republished here.

## Technical note

The site is fully static — no server, no database at run time. All filtering, aggregation and
network rendering happen in the browser against a JSON extract of the project database, with
network layouts and clusters pre-computed ahead of time. It loads in under a second and needs
nothing running to stay available.

The site files are served from the `gh-pages` branch of this repository.

Data current as at the database build of 23 August 2026. Elapsed-time fields use a fixed
reference date of 6 August 2026.
