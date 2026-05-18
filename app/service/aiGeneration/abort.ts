export const AI_GENERATION_JOB_CANCELED_REASON = "AI_GENERATION_JOB_CANCELED";
export const AI_GENERATION_CLIENT_DISCONNECTED_REASON =
  "AI_GENERATION_CLIENT_DISCONNECTED";

type AbortEntry = {
  controller: AbortController;
  cleanup: () => void;
};

const activeGenerationAborts = new Map<number, AbortEntry>();

function abortWith(controller: AbortController, reason: string): void {
  if (!controller.signal.aborted) controller.abort(reason);
}

/** 为生成任务注册可被取消接口触发的中断信号。 */
export function registerGenerationJobAbort(
  jobId: number,
  upstreamSignal?: AbortSignal,
): AbortSignal {
  clearGenerationJobAbort(jobId);

  const controller = new AbortController();
  let cleanup = () => {};

  if (upstreamSignal) {
    const abortFromUpstream = () =>
      abortWith(controller, AI_GENERATION_CLIENT_DISCONNECTED_REASON);
    if (upstreamSignal.aborted) {
      abortFromUpstream();
    } else {
      upstreamSignal.addEventListener("abort", abortFromUpstream, {
        once: true,
      });
      cleanup = () =>
        upstreamSignal.removeEventListener("abort", abortFromUpstream);
    }
  }

  activeGenerationAborts.set(jobId, { controller, cleanup });
  return controller.signal;
}

/** 触发指定生成任务中断。 */
export function abortGenerationJob(jobId: number): boolean {
  const entry = activeGenerationAborts.get(jobId);
  if (!entry) return false;
  abortWith(entry.controller, AI_GENERATION_JOB_CANCELED_REASON);
  return true;
}

/** 清理生成任务中断信号注册。 */
export function clearGenerationJobAbort(
  jobId: number,
  signal?: AbortSignal,
): void {
  const entry = activeGenerationAborts.get(jobId);
  if (!entry || (signal && entry.controller.signal !== signal)) return;
  entry.cleanup();
  activeGenerationAborts.delete(jobId);
}

/** 判断生成信号是否由取消接口触发。 */
export function isJobCanceledSignal(signal: AbortSignal | undefined): boolean {
  return (
    signal?.aborted === true &&
    signal.reason === AI_GENERATION_JOB_CANCELED_REASON
  );
}
