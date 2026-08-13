# Task 10: Scheduled Job with Full Observability

## Prompt

Set up a scheduled background job that syncs data from an external API every 6 hours. The job should:

1. Run every 6 hours automatically
2. Fetch data from `https://api.example.com/data` (mock the fetch)
3. Process and store the results
4. Have full observability:
   - Structured logs for each sync (start, records processed, errors, completion)
   - Custom metrics: sync duration (ms) and record count
   - Distributed tracing to track the full sync flow
   - An auto-generated CloudWatch dashboard showing all the above

## Starting State

Bare Blocks project with an empty `aws-blocks/index.ts`.

## Expected Output

- `aws-blocks/index.ts` — backend with cron job, observability blocks, and a data store

## Verification

- CronJob block instantiated with a schedule (rate or cron expression)
- Logger block instantiated and used in the handler
- Metrics block instantiated with at least 2 metrics recorded
- Tracer block instantiated with at least one span
- Dashboard block instantiated
