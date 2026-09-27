# Descriptive yet succinct

The prose pass every governance review runs (`/sdlc:principle-review`,
`/sdlc:standard-review`) over the reviewed entity's own text. A principle or
standard is read by someone deciding a case the author never saw. The text
has to carry enough for that reader to decide, and nothing more.

## The two failure directions

| Direction | Test | Typical evidence |
|---|---|---|
| `under-described` | A careful reader cannot apply the section to a real case without guessing what the author meant. | A Rule with no boundary; a How-to-apply that names no concrete action; an Examples section that only restates the Statement; a Why that names no failure mode. |
| `over-long` | Removing the text loses no meaning a reader needs. | A paragraph that restates another section; rationale repeated in Rule, Why, and How-to-apply; hedges and decoration; history narrating how the text came to be; a list that says one thing three ways. |

Both directions can appear in one file. Report each as its own issue.

## Section-by-section checks

Ask these per body H2. Required sections come from the entity's `schema.ts`
contract (Principle: Summary / Statement / Why / How it applies /
Implications; Standard: Summary / Rule / Why / How to apply).

- **Summary.** Bullets a reader can act on alone. Missing the one claim the
  entity exists to make → under-described. Bullets restating each other →
  over-long.
- **Statement / Rule.** One reading. Names what is in and what is out. Two
  readers would disagree on a case → under-described. Contains its own
  rationale → over-long, move it to Why.
- **Why.** Names the failure mode it prevents or the outcome it buys. Restates
  the rule as its own reason → under-described. Argues the same point twice →
  over-long.
- **How it applies / How to apply.** Concrete actions for an author, a
  reviewer, or a validator. No action a reader could perform → under-described.
  Repeats the Rule with different words → over-long.
- **Examples / Anti-examples / Implications.** Each entry adds a case the
  sections above do not already settle. An entry that settles nothing new →
  over-long.

## Writing the finding

Each finding carries `section`, `direction`, `evidence`, `fix`.

- `evidence` is a short quote for over-long text, or the missing thing named
  for under-described text.
- `fix` is the concrete edit: the sentence to add, the paragraph to cut, the
  words to replace. A fix a reviewer can apply without re-reading the file.

Prose shape follows [[S-0007-markdown-formatting]]; this rubric adds only
completeness and economy on top.
