export type ItemStatus = "ready" | "customized" | "renamed" | "conflict" | "error";

export interface DetectedTag {
  id: string;
  label: string;
  kind: string;
  active: boolean;
}

export interface RenamerItem {
  id: string;
  originalName: string;
  extension: string;
  sizeBytes?: number | undefined;
  fileHandle?: FileSystemFileHandle | undefined;
  file?: File | undefined;
  title: string;
  year?: number | undefined;
  tags: DetectedTag[];
  suggestedName: string;
  status: ItemStatus;
  warnings: string[];
  selected: boolean;
  renamedSuccess?: boolean | undefined;
  metadataLoading?: boolean | undefined;
}
