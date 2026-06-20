// A tiny concurrency limiter: run the tasks with at most `limit` in flight.
// Keeps the upfront fan-out from hammering the render provider all at once.
export const pLimit = async <T>(
  limit: number,
  tasks: ReadonlyArray<() => Promise<T>>,
): Promise<T[]> => {
  const results: T[] = new Array(tasks.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < tasks.length) {
      const index = next++
      results[index] = await tasks[index]!()
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker))
  return results
}
