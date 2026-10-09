# Domain: sql

Read by `$craft:explain` for a query or a database. Options: `--against <schema doc id>` links
query steps to a schema document; `--plan <explain output>` folds an `EXPLAIN` into cost notes;
`--tables a,b,c` limits a database to those tables and their neighbours.

## A query

One `prose` block for the plan, one `annotated-text` block (`language: sql`) for the SQL.

- Steps in **execution order**, not reading order: sources, filters, joins, aggregates,
  windows, ordering, limit. One step per clause that does work; trivial ones merge.
- Each step anchored by a `TextQuoteSelector`: the exact SQL, plus `prefix` and `suffix` when
  it repeats. Nest freely: a CTE is one step and its filter another.
- `source` on the block for the file, and on each step for its lines.
- `detail` says what the step does, how the planner runs it, what it costs. `touches` lists
  `table.column`; `cost.rows` where known.
- A `warning` for a literal list of statuses, a `LIMIT` after a `RANK`, a predicate that
  defeats an index.

## A database

One `schema` block.

- Every table with a `purpose` that says what a row is, not what the columns are. Row counts
  where known.
- Columns with type, nullability, default, `references`, and a `purpose` only where the name
  does not say it.
- Indexes with the query they serve. A partial index carries its `where`.
- `groups` by domain so the page reads in chunks; relations derive from `references`.
- `source` on every table: the DDL or migration lines that define it.
- A `note` on every table where the data disagrees with the shape: a denormalised total, a
  legacy flag, a soft delete. The fix is a proposal, not a question here.

Ids: `s-<word>` for query steps; the table name and `table.column` for a schema.
