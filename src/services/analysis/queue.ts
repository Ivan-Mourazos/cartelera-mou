/**
 * Cola con concurrencia limitada y cancelación.
 *
 * El análisis de un fichero de 100 GB solo lee cabeceras, pero abrir decenas de
 * ficheros a la vez satura discos lentos y unidades de red. Un fallo individual
 * nunca detiene el lote: se devuelve como resultado de esa tarea.
 */

export interface QueueTaskResult<T> {
  readonly index: number;
  readonly value: T | undefined;
  readonly error: Error | undefined;
}

export interface RunQueueOptions<T> {
  readonly concurrency?: number;
  readonly signal?: AbortSignal;
  readonly onSettled?: (result: QueueTaskResult<T>) => void;
  readonly onProgress?: (completed: number, total: number) => void;
}

export const runWithConcurrency = async <TInput, TOutput>(
  inputs: readonly TInput[],
  task: (input: TInput, index: number) => Promise<TOutput>,
  options: RunQueueOptions<TOutput> = {},
): Promise<readonly QueueTaskResult<TOutput>[]> => {
  const concurrency = Math.max(1, options.concurrency ?? 2);
  const results: QueueTaskResult<TOutput>[] = new Array<QueueTaskResult<TOutput>>(inputs.length);
  let nextIndex = 0;
  let completed = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= inputs.length) return;
      if (options.signal?.aborted === true) {
        results[index] = { index, value: undefined, error: new Error("Cancelado") };
        continue;
      }

      const input = inputs[index];
      if (input === undefined) continue;

      let result: QueueTaskResult<TOutput>;
      try {
        result = { index, value: await task(input, index), error: undefined };
      } catch (error) {
        result = {
          index,
          value: undefined,
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }

      results[index] = result;
      completed += 1;
      options.onSettled?.(result);
      options.onProgress?.(completed, inputs.length);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, inputs.length) }, () => worker()));
  return results;
};
