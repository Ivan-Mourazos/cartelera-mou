import type {
  AppSettings,
  AudioTrack,
  DesktopGateway,
  FfprobeValidation,
  HistoryEntry,
  IdentifyMediaFileRequest,
  MovieRecord,
  NamingTag,
  NamingToken,
  PreflightIssue,
  PreflightResult,
  RenameBatchRequest,
  RenameBatchResult,
  SaveSettingsRequest,
  ScanFolderRequest,
  ScanFolderResult,
  ScanItem,
  ScanProgress,
  SubtitleTrack,
  TmdbCandidate,
  TmdbSearchRequest,
  UndoResult,
  VideoDetails,
} from "./types";
import { analyzeAndGenerateFilename } from "./naming-bridge";

const TAG_ORDER: NamingTag[] = [
  "resolution",
  "source",
  "releaseType",
  "videoCodec",
  "bitDepth",
  "dolbyVision",
  "dolbyVisionProfile",
  "hdr",
  "audioCodec",
  "spatialAudio",
  "channels",
  "audioLanguages",
  "subtitles",
  "edition",
  "identifier",
];

const DEFAULT_SETTINGS: AppSettings = {
  titleLanguage: "es-ES",
  region: "ES",
  ffprobePath: "",
  tmdbConfigured: false,
  tmdbCredentialSource: "none",
  tmdbCredentialPersistence: "processMemoryOnly",
  namingTemplate: "{title} ({year}) {tags}",
  matchThreshold: 80,
  includeIdentifier: false,
  tagOrder: TAG_ORDER,
  enabledTags: TAG_ORDER.filter((tag) => tag !== "identifier"),
  theme: "dark",
};

const DEFAULT_VIDEO: VideoDetails = {
  codec: "HEVC",
  profile: "Main 10",
  dolbyVisionProfile: "8",
  level: "5.1",
  width: 3840,
  height: 2160,
  bitDepth: 10,
  frameRate: "23.976",
  bitrate: 68_400_000,
  hdrFormat: "Dolby Vision, HDR10",
  colorSpace: "BT.2020",
};

const DEFAULT_AUDIO: AudioTrack[] = [
  {
    index: 1,
    language: "es",
    title: "Castellano",
    codec: "TrueHD",
    channels: 8,
    channelLayout: "7.1",
    bitrate: 4_216_000,
    hasAtmos: true,
    hasDtsX: false,
    isDefault: true,
    isCommentary: false,
  },
  {
    index: 2,
    language: "en",
    title: "English",
    codec: "TrueHD",
    channels: 8,
    channelLayout: "7.1",
    bitrate: 4_410_000,
    hasAtmos: true,
    hasDtsX: false,
    isDefault: false,
    isCommentary: false,
  },
];

const DEFAULT_SUBTITLES: SubtitleTrack[] = [
  {
    index: 3,
    language: "es",
    title: "Castellano",
    codec: "PGS",
    isDefault: true,
    isForced: false,
    isHearingImpaired: false,
  },
  {
    index: 4,
    language: "en",
    title: "English SDH",
    codec: "PGS",
    isDefault: false,
    isForced: false,
    isHearingImpaired: true,
  },
];

interface DemoMovieSeed {
  title: string;
  originalTitle: string;
  year: number;
  overview: string;
  genres: string[];
  runtimeMinutes: number;
  resolution: string;
  source: string;
  filename: string;
  accent: string;
}

const MOVIE_SEEDS: DemoMovieSeed[] = [
  {
    title: "Dune: Parte dos",
    originalTitle: "Dune: Part Two",
    year: 2024,
    overview:
      "Paul Atreides se une a Chani y a los Fremen mientras emprende un viaje de venganza y debe elegir entre el amor y el destino del universo conocido.",
    genres: ["Ciencia ficción", "Aventura"],
    runtimeMinutes: 166,
    resolution: "2160p",
    source: "UHD Blu-ray",
    filename:
      "Dune - Parte dos (2024) [2160p] [UHD Blu-ray] [REMUX] [HEVC] [10-bit] [Dolby Vision] [HDR10] [TrueHD] [Atmos] [7.1] [ES] [EN] [SUB ES].mkv",
    accent: "sand",
  },
  {
    title: "Oppenheimer",
    originalTitle: "Oppenheimer",
    year: 2023,
    overview:
      "El físico J. Robert Oppenheimer dirige el proyecto que cambiará para siempre la historia y su propia vida.",
    genres: ["Drama", "Historia"],
    runtimeMinutes: 181,
    resolution: "2160p",
    source: "WEB-DL",
    filename:
      "Oppenheimer (2023) [2160p] [WEB-DL] [HEVC] [Dolby Vision] [HDR10] [E-AC-3] [Atmos] [5.1] [IMAX].mkv",
    accent: "ember",
  },
  {
    title: "El asesino",
    originalTitle: "The Killer",
    year: 2023,
    overview:
      "Tras un error casi fatal, un asesino se enfrenta a sus empleadores y a sí mismo durante una persecución internacional.",
    genres: ["Crimen", "Suspense"],
    runtimeMinutes: 118,
    resolution: "1080p",
    source: "Blu-ray",
    filename: "El asesino (2023) [1080p] [Blu-ray] [H.264] [DTS-HD MA] [5.1] [ES] [EN].mkv",
    accent: "steel",
  },
  {
    title: "Alien: El octavo pasajero",
    originalTitle: "Alien",
    year: 1979,
    overview:
      "La tripulación de una nave comercial responde a una señal desconocida y lleva a bordo una amenaza inesperada.",
    genres: ["Terror", "Ciencia ficción"],
    runtimeMinutes: 117,
    resolution: "2160p",
    source: "UHD Blu-ray",
    filename:
      "Alien (1979) [2160p] [UHD Blu-ray] [REMUX] [HEVC] [HDR10] [TrueHD] [7.1] [Director's Cut].mkv",
    accent: "acid",
  },
  {
    title: "La llegada",
    originalTitle: "Arrival",
    year: 2016,
    overview:
      "Una lingüista intenta comunicarse con visitantes extraterrestres antes de que la tensión mundial desencadene un conflicto.",
    genres: ["Ciencia ficción", "Drama"],
    runtimeMinutes: 116,
    resolution: "2160p",
    source: "UHD Blu-ray",
    filename: "La llegada (2016) [2160p] [UHD Blu-ray] [HEVC] [HDR10] [DTS-HD MA] [5.1].mkv",
    accent: "mist",
  },
  {
    title: "Parásitos",
    originalTitle: "Gisaengchung",
    year: 2019,
    overview:
      "Una familia sin trabajo encuentra una oportunidad inesperada en el hogar de otra familia acomodada.",
    genres: ["Comedia", "Suspense", "Drama"],
    runtimeMinutes: 132,
    resolution: "1080p",
    source: "Blu-ray",
    filename: "Parásitos (2019) [1080p] [Blu-ray] [REMUX] [H.264] [DTS-HD MA] [5.1] [KO].mkv",
    accent: "garden",
  },
  {
    title: "Blade Runner 2049",
    originalTitle: "Blade Runner 2049",
    year: 2017,
    overview:
      "Un nuevo blade runner descubre un secreto que podría sumir en el caos lo que queda de la sociedad.",
    genres: ["Ciencia ficción", "Drama"],
    runtimeMinutes: 164,
    resolution: "2160p",
    source: "UHD Blu-ray",
    filename:
      "Blade Runner 2049 (2017) [2160p] [UHD Blu-ray] [REMUX] [HEVC] [Dolby Vision] [HDR10] [Atmos] [7.1].mkv",
    accent: "neon",
  },
  {
    title: "El viaje de Chihiro",
    originalTitle: "Sen to Chihiro no kamikakushi",
    year: 2001,
    overview:
      "Una niña entra en un mundo de espíritus y debe encontrar el valor para salvar a sus padres y regresar a casa.",
    genres: ["Animación", "Fantasía"],
    runtimeMinutes: 125,
    resolution: "1080p",
    source: "Blu-ray",
    filename:
      "El viaje de Chihiro (2001) [1080p] [Blu-ray] [H.264] [DTS-HD MA] [5.1] [JA] [SUB ES].mkv",
    accent: "rose",
  },
];

function clone<T>(value: T): T {
  return structuredClone(value);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function createLibrary(): MovieRecord[] {
  return MOVIE_SEEDS.map((movie, index) => ({
    id: index + 1,
    mediaFileId: index + 1,
    tmdbId: [693134, 872585, 800158, 348, 329865, 496243, 335984, 129][index] ?? null,
    title: movie.title,
    originalTitle: movie.originalTitle,
    year: movie.year,
    releaseDate: `${movie.year}-10-01`,
    overview: movie.overview,
    runtimeMinutes: movie.runtimeMinutes,
    genres: movie.genres,
    posterUrl: null,
    backdropUrl: null,
    collectionName: index === 0 ? "Dune" : null,
    currentFilename: movie.filename,
    currentPath: `C:\\Películas\\${movie.filename}`,
    extension: "mkv",
    container: "Matroska",
    sizeBytes: (28 + index * 7) * 1_073_741_824,
    resolution: movie.resolution,
    source: movie.source,
    releaseType: movie.filename.includes("REMUX") ? "REMUX" : null,
    addedAt: new Date(Date.now() - index * 86_400_000 * 3).toISOString(),
    video:
      movie.resolution === "2160p"
        ? DEFAULT_VIDEO
        : { ...DEFAULT_VIDEO, width: 1920, height: 1080, hdrFormat: null },
    audioTracks: DEFAULT_AUDIO,
    subtitleTracks: DEFAULT_SUBTITLES,
  }));
}

function tokenizeProposal(filename: string): NamingToken[] {
  const extensionStart = filename.lastIndexOf(".");
  const stem = extensionStart >= 0 ? filename.slice(0, extensionStart) : filename;
  const extension = extensionStart >= 0 ? filename.slice(extensionStart) : "";
  const yearMatch = /\((\d{4})\)/u.exec(stem);
  const firstBracket = stem.indexOf("[");
  const titleEnd = yearMatch?.index ?? (firstBracket >= 0 ? firstBracket : stem.length);
  const title = stem.slice(0, titleEnd).trim();
  const tags = [...stem.matchAll(/\[([^\]]+)\]/g)].map((match) => match[1] ?? "");
  const result: NamingToken[] = [
    { id: "title", label: title, source: "tmdb", kind: "title", edited: false },
  ];
  if (yearMatch?.[1]) {
    result.push({
      id: "year",
      label: `(${yearMatch[1]})`,
      source: "tmdb",
      kind: "year",
      edited: false,
    });
  }
  tags.forEach((label, index) => {
    result.push({
      id: `tag-${index}`,
      label: `[${label}]`,
      source: index < 2 ? "filename" : "ffprobe",
      kind: "tag",
      edited: false,
    });
  });
  if (extension) {
    result.push({
      id: "extension",
      label: extension,
      source: "filename",
      kind: "extension",
      edited: false,
    });
  }
  return result;
}

function createScanItems(folderPath: string): ScanItem[] {
  const total = 84;
  return Array.from({ length: total }, (_, index) => {
    const seed = MOVIE_SEEDS[index % MOVIE_SEEDS.length];
    if (!seed) throw new Error("No hay datos de demostración disponibles.");
    const copy = Math.floor(index / MOVIE_SEEDS.length);
    const suffix = copy === 0 ? "" : ` Disc ${copy + 1}`;
    const originalFilename = `${seed.originalTitle.replaceAll(":", "").replaceAll(" ", ".")}.${seed.year}.${seed.resolution}.${seed.source.replaceAll(" ", ".")}.HEVC.mkv`;
    const naming = analyzeAndGenerateFilename(originalFilename, {
      localizedTitle: seed.title,
      year: seed.year,
    });
    const proposedFilename =
      copy === 0
        ? naming.generated.filename
        : naming.generated.filename.replace(/\.mkv$/iu, ` [Disc ${copy + 1}].mkv`);
    const needsReview = index % 11 === 5;
    const hasConflict = index === 9;
    return {
      id: `scan-${index + 1}`,
      mediaFileId: index + 1,
      movieId: index < MOVIE_SEEDS.length ? index + 1 : null,
      path: `${folderPath}\\${originalFilename.replace(".mkv", `${suffix}.mkv`)}`,
      originalFilename: originalFilename.replace(".mkv", `${suffix}.mkv`),
      proposedFilename,
      title: seed.title,
      originalTitle: seed.originalTitle,
      year: seed.year,
      extension: "mkv",
      container: "Matroska",
      sizeBytes: (18 + (index % 14) * 3) * 1_073_741_824,
      resolution: seed.resolution,
      source: seed.source,
      releaseType: proposedFilename.includes("REMUX") ? "REMUX" : null,
      posterUrl: null,
      matchScore: hasConflict ? 91 : needsReview ? 68 : 92 - (index % 4),
      matchLevel: needsReview ? "medium" : "high",
      scoreReasons: needsReview
        ? [
            { label: "Título similar", points: 38 },
            { label: "Año exacto", points: 30 },
            { label: "Varios resultados cercanos", points: -12 },
          ]
        : [
            { label: "Título exacto", points: 50 },
            { label: "Año exacto", points: 30 },
            { label: "Título alternativo", points: 10 },
          ],
      status: hasConflict ? "conflict" : needsReview ? "review" : "ready",
      warnings: hasConflict
        ? ["Ya existe un archivo con este nombre en la carpeta."]
        : needsReview
          ? ["Hay varios candidatos con un título parecido."]
          : [],
      tokens: copy === 0 ? naming.tokens : tokenizeProposal(proposedFilename),
      video:
        seed.resolution === "2160p"
          ? DEFAULT_VIDEO
          : { ...DEFAULT_VIDEO, width: 1920, height: 1080, hdrFormat: null },
      audioTracks: DEFAULT_AUDIO,
      subtitleTracks: DEFAULT_SUBTITLES,
    };
  });
}

function directoryOf(path: string): string {
  const separator = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  return separator >= 0 ? path.slice(0, separator) : path;
}

function filenameOf(path: string): string {
  const separator = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  return separator >= 0 ? path.slice(separator + 1) : path;
}

function joinPath(directory: string, filename: string): string {
  const separator = directory.includes("\\") ? "\\" : "/";
  return `${directory}${separator}${filename}`;
}

function createHistory(): HistoryEntry[] {
  const now = Date.now();
  return [
    {
      id: 3,
      batchId: 2,
      mediaFileId: 3,
      oldPath: "C:\\Películas\\The.Killer.2023.1080p.BluRay.x264.DTS-HD.MA.5.1.mkv",
      newPath: `C:\\Películas\\${MOVIE_SEEDS[2]?.filename ?? "El asesino.mkv"}`,
      status: "completed",
      errorMessage: null,
      performedAt: new Date(now - 1_800_000).toISOString(),
      undoneAt: null,
      canUndo: true,
    },
    {
      id: 2,
      batchId: 1,
      mediaFileId: 2,
      oldPath: "C:\\Películas\\Oppenheimer.2023.IMAX.2160p.WEB-DL.DDP5.1.Atmos.DV.HDR.HEVC.mkv",
      newPath: `C:\\Películas\\${MOVIE_SEEDS[1]?.filename ?? "Oppenheimer.mkv"}`,
      status: "completed",
      errorMessage: null,
      performedAt: new Date(now - 86_400_000).toISOString(),
      undoneAt: null,
      canUndo: true,
    },
    {
      id: 1,
      batchId: 1,
      mediaFileId: 99,
      oldPath: "C:\\Películas\\archivo-con-ruta-muy-larga.mkv",
      newPath: "C:\\Películas\\propuesta.mkv",
      status: "failed",
      errorMessage: "La ruta de destino supera el límite seguro configurado.",
      performedAt: new Date(now - 86_400_000).toISOString(),
      undoneAt: null,
      canUndo: false,
    },
  ];
}

export class DemoDesktopGateway implements DesktopGateway {
  public readonly mode = "demo" as const;
  private library = createLibrary();
  private history = createHistory();
  private settings = clone(DEFAULT_SETTINGS);
  private nextHistoryId = 4;
  private nextBatchId = 3;
  private nextMovieId = 10_000;
  private readonly mediaPaths = new Map<number, string>();
  private readonly scannedItems = new Map<number, ScanItem>();

  public async selectFolder(): Promise<string | null> {
    await wait(180);
    return "C:\\Películas\\Demo";
  }

  public async scanFolder(
    request: ScanFolderRequest,
    onProgress: (progress: ScanProgress) => void,
  ): Promise<ScanFolderResult> {
    const items = createScanItems(request.folderPath);
    items.forEach((item) => {
      this.mediaPaths.set(item.mediaFileId, item.path);
      this.scannedItems.set(item.mediaFileId, clone(item));
    });
    const checkpoints: ScanProgress[] = [
      {
        stage: "discovering",
        completed: 0,
        total: items.length,
        currentFile: null,
        message: "Buscando archivos de vídeo…",
      },
      {
        stage: "probing",
        completed: 18,
        total: items.length,
        currentFile: items[17]?.originalFilename ?? null,
        message: "Leyendo metadatos técnicos…",
      },
      {
        stage: "probing",
        completed: 46,
        total: items.length,
        currentFile: items[45]?.originalFilename ?? null,
        message: "Leyendo pistas de audio y subtítulos…",
      },
      {
        stage: "identifying",
        completed: 67,
        total: items.length,
        currentFile: items[66]?.originalFilename ?? null,
        message: "Comparando títulos y años…",
      },
      {
        stage: "proposing",
        completed: 81,
        total: items.length,
        currentFile: items[80]?.originalFilename ?? null,
        message: "Generando nombres propuestos…",
      },
    ];
    for (const checkpoint of checkpoints) {
      onProgress(checkpoint);
      await wait(260);
    }
    onProgress({
      stage: "complete",
      completed: items.length,
      total: items.length,
      currentFile: null,
      message: `${items.length} archivos preparados para revisión.`,
    });
    return { folderPath: request.folderPath, items, warnings: [] };
  }

  public async validateFfprobe(path: string): Promise<FfprobeValidation> {
    await wait(320);
    const detectedPath = path.trim() || "C:\\ffmpeg\\bin\\ffprobe.exe";
    return {
      valid: !detectedPath.toLowerCase().includes("incorrecto"),
      detectedPath,
      version: "7.1.1",
      message: detectedPath.toLowerCase().includes("incorrecto")
        ? "No se pudo ejecutar ffprobe en esa ruta."
        : "ffprobe está disponible y responde correctamente.",
    };
  }

  public async listLibrary(): Promise<MovieRecord[]> {
    await wait(120);
    return clone(this.library);
  }

  public async identifyMediaFile(request: IdentifyMediaFileRequest): Promise<MovieRecord> {
    await wait(180);
    const item = this.scannedItems.get(request.mediaFileId);
    const current = this.library.find((movie) => movie.mediaFileId === request.mediaFileId);
    const sameTmdbMovie = this.library.find((movie) => movie.tmdbId === request.candidate.tmdbId);
    if (!item && !current) {
      throw new Error(`No existe el archivo multimedia ${request.mediaFileId}.`);
    }
    const currentPath = this.pathForMedia(request.mediaFileId);
    const movie: MovieRecord = {
      id: sameTmdbMovie?.id ?? current?.id ?? this.nextMovieId++,
      mediaFileId: request.mediaFileId,
      tmdbId: request.candidate.tmdbId,
      title: request.candidate.title,
      originalTitle: request.candidate.originalTitle || null,
      year: request.candidate.year,
      releaseDate: null,
      overview: request.candidate.overview,
      runtimeMinutes: sameTmdbMovie?.runtimeMinutes ?? null,
      genres: sameTmdbMovie?.genres ?? [],
      posterUrl: request.candidate.posterUrl,
      backdropUrl: sameTmdbMovie?.backdropUrl ?? null,
      collectionName: sameTmdbMovie?.collectionName ?? null,
      currentFilename: filenameOf(currentPath),
      currentPath,
      extension: item?.extension ?? current?.extension ?? "mkv",
      container: item?.container ?? current?.container ?? null,
      sizeBytes: item?.sizeBytes ?? current?.sizeBytes ?? 0,
      resolution: item?.resolution ?? current?.resolution ?? null,
      source: item?.source ?? current?.source ?? null,
      releaseType: item?.releaseType ?? current?.releaseType ?? null,
      addedAt: current?.addedAt ?? new Date().toISOString(),
      video: clone(item?.video ?? current?.video ?? null),
      audioTracks: clone(item?.audioTracks ?? current?.audioTracks ?? []),
      subtitleTracks: clone(item?.subtitleTracks ?? current?.subtitleTracks ?? []),
    };
    this.library = [
      movie,
      ...this.library.filter((entry) => entry.mediaFileId !== movie.mediaFileId),
    ];
    return clone(movie);
  }

  public async listHistory(): Promise<HistoryEntry[]> {
    await wait(120);
    return clone(this.history);
  }

  public async getSettings(): Promise<AppSettings> {
    await wait(80);
    return clone(this.settings);
  }

  public async saveSettings(request: SaveSettingsRequest): Promise<AppSettings> {
    await wait(240);
    const { tmdbToken, ...settings } = request;
    this.settings = {
      ...clone(settings),
      tmdbConfigured: Boolean(tmdbToken?.trim()) || settings.tmdbConfigured,
      tmdbCredentialSource: tmdbToken?.trim() ? "session" : settings.tmdbCredentialSource,
    };
    return clone(this.settings);
  }

  public async preflightRenameBatch(request: RenameBatchRequest): Promise<PreflightResult> {
    await wait(300);
    const issues: PreflightIssue[] = [];
    const destinations = new Map<string, string>();
    for (const item of request.items) {
      const currentPath = this.pathForMedia(item.mediaFileId);
      const destination = joinPath(directoryOf(currentPath), item.proposedFilename);
      const normalized = destination.toLocaleLowerCase("es-ES");
      const previousClientId = destinations.get(normalized);
      if (previousClientId) {
        issues.push({
          clientId: item.clientId,
          code: "duplicate_in_batch",
          message: `Otro archivo del lote propone “${item.proposedFilename}”.`,
          severity: "error",
        });
      } else {
        destinations.set(normalized, item.clientId);
      }
      if (destination.length > 240) {
        issues.push({
          clientId: item.clientId,
          code: "path_too_long",
          message: "La ruta propuesta supera el límite seguro de 240 caracteres.",
          severity: "error",
        });
      }
      if (/[<>:"/\\|?*]/u.test(item.proposedFilename.replace(/\\/gu, ""))) {
        issues.push({
          clientId: item.clientId,
          code: "invalid_windows_character",
          message: "El nombre contiene un carácter incompatible con Windows.",
          severity: "error",
        });
      }
    }
    return {
      valid: !issues.some((issue) => issue.severity === "error"),
      readyCount:
        request.items.length -
        new Set(issues.filter((issue) => issue.severity === "error").map((issue) => issue.clientId))
          .size,
      issues,
    };
  }

  public async executeRenameBatch(request: RenameBatchRequest): Promise<RenameBatchResult> {
    await wait(520);
    const batchId = this.nextBatchId++;
    const results = request.items.map((item) => {
      const currentPath = this.pathForMedia(item.mediaFileId);
      const newPath = joinPath(directoryOf(currentPath), item.proposedFilename);
      const history: HistoryEntry = {
        id: this.nextHistoryId++,
        batchId,
        mediaFileId: item.mediaFileId,
        oldPath: currentPath,
        newPath,
        status: "completed",
        errorMessage: null,
        performedAt: new Date().toISOString(),
        undoneAt: null,
        canUndo: true,
      };
      this.history.unshift(history);
      this.library = this.library.map((movie) =>
        movie.mediaFileId === item.mediaFileId
          ? { ...movie, currentPath: newPath, currentFilename: item.proposedFilename }
          : movie,
      );
      return {
        clientId: item.clientId,
        mediaFileId: item.mediaFileId,
        status: "completed" as const,
        oldPath: currentPath,
        newPath,
        errorMessage: null,
      };
    });
    return { batchId, succeeded: results.length, failed: 0, results };
  }

  public async undoRename(historyId: number): Promise<UndoResult> {
    await wait(360);
    const entry = this.history.find((item) => item.id === historyId);
    if (!entry?.canUndo) {
      return {
        historyId,
        status: "failed",
        restoredPath: null,
        errorMessage: "La operación ya no puede deshacerse de forma segura.",
      };
    }
    const undoneAt = new Date().toISOString();
    this.history = this.history.map((item) =>
      item.id === historyId ? { ...item, status: "undone", canUndo: false, undoneAt } : item,
    );
    this.library = this.library.map((movie) =>
      movie.mediaFileId === entry.mediaFileId
        ? { ...movie, currentPath: entry.oldPath, currentFilename: filenameOf(entry.oldPath) }
        : movie,
    );
    return { historyId, status: "undone", restoredPath: entry.oldPath, errorMessage: null };
  }

  public async searchTmdb(request: TmdbSearchRequest): Promise<TmdbCandidate[]> {
    await wait(300);
    const normalized = request.query.toLocaleLowerCase(request.language);
    return MOVIE_SEEDS.filter((movie) =>
      `${movie.title} ${movie.originalTitle}`
        .toLocaleLowerCase(request.language)
        .includes(normalized),
    )
      .slice(0, 5)
      .map((movie, index) => ({
        tmdbId: 1000 + index,
        title: movie.title,
        originalTitle: movie.originalTitle,
        year: movie.year,
        overview: movie.overview,
        posterUrl: null,
        matchScore: request.year === movie.year ? 90 : 60,
        matchLevel: request.year === movie.year ? "high" : "medium",
        scoreReasons:
          request.year === movie.year
            ? [{ label: "Título y año exactos", points: 90 }]
            : [{ label: "Título similar", points: 60 }],
      }));
  }

  private pathForMedia(mediaFileId: number): string {
    const scannedPath = this.mediaPaths.get(mediaFileId);
    if (scannedPath) return scannedPath;
    return (
      this.library.find((movie) => movie.mediaFileId === mediaFileId)?.currentPath ??
      `C:\\Películas\\media-${mediaFileId}.mkv`
    );
  }
}
