import type { CloudCoachModel } from '../../domain/models/learner';
import type { AppError } from '../../shared/errors';
import type { Result } from '../../shared/result';

/**
 * Coach providers behind replaceable interfaces (spec §24.3). The curated
 * coach is pure (domain/coach/curated.ts) and always available. The cloud
 * transport lives in integrations/http/; the on-device model manager is an
 * interface only in this build (ADR 0008).
 */
export interface CloudCoachRequest {
  readonly apiKey: string;
  readonly model: CloudCoachModel;
  readonly system: string;
  readonly message: string;
  readonly signal?: AbortSignal;
}

export interface CloudCoachResponse {
  readonly text: string;
}

export interface CloudCoachTransport {
  /** Anthropic, for the notice "your data is sent to …". */
  readonly providerName: string;
  send(req: CloudCoachRequest): Promise<Result<CloudCoachResponse, AppError>>;
}

export type OnDeviceModelStatus =
  | { readonly state: 'unsupported'; readonly reason: string }
  | { readonly state: 'not_downloaded'; readonly sizeBytes: number }
  | { readonly state: 'downloading'; readonly progress: number }
  | { readonly state: 'ready'; readonly sizeBytes: number };

/** Downloads (over Wi-Fi, checksum-verified), runs and deletes an on-device model. */
export interface OnDeviceModelManager {
  status(): Promise<OnDeviceModelStatus>;
  download(onProgress: (fraction: number) => void, signal?: AbortSignal): Promise<Result<void, AppError>>;
  remove(): Promise<Result<void, AppError>>;
  generate(system: string, message: string, signal?: AbortSignal): Promise<Result<CloudCoachResponse, AppError>>;
}

/**
 * This build has no on-device model (ADR 0008): no model download is
 * offered, and the coach uses the curated or (if chosen) cloud provider.
 */
export function createUnsupportedOnDeviceModel(): OnDeviceModelManager {
  const reason = 'The on-device coach is not part of this version of the app. The curated coach works offline instead.';
  const no = async () => ({ ok: false as const, error: { kind: 'ProviderUnavailable' as const, message: reason } });
  return { status: async () => ({ state: 'unsupported', reason }), download: no, remove: async () => ({ ok: true as const, value: undefined }), generate: no };
}
