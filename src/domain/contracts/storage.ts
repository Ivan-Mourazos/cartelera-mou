export interface LocalMediaSource {
  readonly path: string;
  readonly size: number;
  readonly checksum?: string;
}

export interface RemoteObjectReference {
  readonly providerId: string;
  readonly objectKey: string;
  readonly etag?: string;
}

export interface StorageObjectMetadata {
  readonly size: number;
  readonly contentType?: string;
  readonly etag?: string;
  readonly lastModified?: string;
}

export type MediaLocation =
  | { readonly kind: "local"; readonly path: string }
  | { readonly kind: "remote"; readonly object: RemoteObjectReference }
  | {
      readonly kind: "cached";
      readonly localPath: string;
      readonly object: RemoteObjectReference;
    }
  | {
      readonly kind: "synchronizing";
      readonly direction: "upload" | "download";
      readonly progress: number;
      readonly localPath?: string;
      readonly object?: RemoteObjectReference;
    }
  | {
      readonly kind: "unavailable";
      readonly lastKnown?: LocalMediaSource | RemoteObjectReference;
      readonly reason: string;
    };

export interface StorageProvider {
  readonly id: string;
  upload(
    source: LocalMediaSource,
    destinationKey: string,
    signal?: AbortSignal,
  ): Promise<RemoteObjectReference>;
  download(
    object: RemoteObjectReference,
    destinationPath: string,
    signal?: AbortSignal,
  ): Promise<LocalMediaSource>;
  delete(object: RemoteObjectReference, signal?: AbortSignal): Promise<void>;
  exists(object: RemoteObjectReference, signal?: AbortSignal): Promise<boolean>;
  getSignedUrl(
    object: RemoteObjectReference,
    expiresInSeconds: number,
    signal?: AbortSignal,
  ): Promise<string>;
  getMetadata(object: RemoteObjectReference, signal?: AbortSignal): Promise<StorageObjectMetadata>;
}
