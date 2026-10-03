---
name: performance
description: Use when a change may be slow or expensive — slow queries, indexes, feed latency (GET /api/feed/today), connection pool pressure, mobile render cost, load testing, benchmarking, or profiling. Measure before optimizing.
---

# Performance

## Measure before changing anything

No optimization without a number. Start with a measurement, state the target, and compare after.
Profiling and benchmarks are cheap; guessing is expensive and frequently wrong.

## Profiling

- **API** — measure the endpoint that matters: `GET /api/feed/today` is on every student app
  open. Time it at p50 and p95, not average. Check Supabase query timings and the Postgres log for
  the slowest statement before blaming the application code.
- **Database** — look at the query plan for anything doing a sort, join, or scan. The tables most
  likely to grow are `submissions` (one row per answer, per student, per day) and `questions`.
  Index what you filter and order by; confirm the index is actually used.
- **Mobile** — profile a release build or a dev build with the profiler attached. Watch for
  re-renders on the pager (a new object identity per item re-renders the whole feed), unvirtualized
  long lists, images sized wrong for the screen, and animations running off the JS thread.
- Use React DevTools Profiler to find the component, not to guess which one.

## Load testing

Targets for the pilot: one teacher activates a set, a class-sized group of students opens the feed
and answers at once.

- Test the realistic shape: concurrent feed reads on activation morning, and concurrent submission
  writes as students finish.
- Watch connection pool exhaustion under Supabase's pooler, not just request latency. Running out
  of connections looks like a hang, not like slowness.
- Include the cold path — first request after a deploy, with an empty query-plan cache.
- Re-run after any schema or index change. A migration is a performance change.

## Benchmarking

- Before/after on the same machine, same data, same script. Otherwise the number means nothing.
- Use production-scale data volumes. A benchmark against 50 rows proves nothing about 50,000.
- Report p50/p95/p99 plus throughput, and note error rate. A fast endpoint returning 500s is not fast.
- Keep the harness in the repo so anyone can reproduce the number.

## Common hot spots in this repo

- **Feed assembly** — sampling K per section with a seeded RNG. `K` is a knob; raising it multiplies
  the read cost.
- **Submissions** — the highest-volume table. Check indexes on the lookup columns and that progress
  is computed by aggregation, not N+1 queries in a loop.
- **Reports and leaderboards** — aggregation over a period; ensure it does not load full rows to
  compute a sum.
- **Mobile feed** — image sizing and list virtualization dominate here more than anything on the
  server.
- **Seeding** — `npm run seed` is a bulk insert path; keep it batched rather than one insert per row.

## Rules

- Do not add a cache, a queue, or a CDN before a measurement shows the need.
- Premature caching in this app introduces invalidation bugs that are harder than the latency it
  removes.
- Prefer a query or index fix over an application-level workaround.
- If a change trades correctness for speed, it is not a performance change — it is a defect.
- Note the improvement in the PR: before, after, and how it was measured.
