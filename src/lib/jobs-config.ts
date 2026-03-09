/**
 * Configuration for the AI Data Cleanser job queue.
 * max_concurrency limits how many jobs can run simultaneously.
 */
export const AI_DATA_CLEANSER_MAX_CONCURRENCY =
  Number(process.env.AI_DATA_CLEANSER_MAX_CONCURRENCY) || 2;
