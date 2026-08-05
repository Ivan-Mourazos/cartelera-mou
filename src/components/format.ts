const BYTES_IN_GIB = 1024 ** 3;
const BYTES_IN_MIB = 1024 ** 2;

export function formatBytes(bytes: number): string {
  if (bytes >= BYTES_IN_GIB) {
    return `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(bytes / BYTES_IN_GIB)} GB`;
  }
  return `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(bytes / BYTES_IN_MIB)} MB`;
}

export function formatBitrate(bitsPerSecond: number | null): string {
  if (bitsPerSecond === null) return "No disponible";
  return `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(bitsPerSecond / 1_000_000)} Mb/s`;
}

export function formatDuration(minutes: number | null): string {
  if (minutes === null) return "Duración no disponible";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours > 0 ? `${hours} h ${remainder} min` : `${remainder} min`;
}

export function formatDate(value: string): string {
  const date = new Date(value);
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function filenameFromPath(path: string): string {
  const separator = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  return separator >= 0 ? path.slice(separator + 1) : path;
}
