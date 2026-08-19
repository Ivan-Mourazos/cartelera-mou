export interface TmdbMatchQuery {
  readonly title: string;
  readonly year?: number;
  /** Duración real del archivo. La señal de desempate más fuerte que hay. */
  readonly runtimeMinutes?: number;
  /** Idiomas base de las pistas de audio (`es`, `en`…). */
  readonly audioLanguages?: readonly string[];
  readonly previouslySelectedTmdbId?: number;
}

export interface TmdbMovieCandidate {
  readonly id: number;
  readonly title: string;
  readonly originalTitle?: string;
  readonly originalLanguage?: string;
  readonly alternativeTitles?: readonly string[];
  readonly releaseYear?: number;
  readonly runtimeMinutes?: number;
  /** Posición en la respuesta del proveedor: su relevancia también es un dato. */
  readonly providerOrder?: number;
}

export type MatchBand = "high" | "medium" | "low";

export interface MatchScoreComponent {
  readonly code:
    | "title-exact"
    | "title-similar"
    | "original-title-exact"
    | "alternative-title-exact"
    | "year-exact"
    | "year-close"
    | "year-different"
    | "original-language-present"
    | "provider-relevance"
    | "runtime-compatible"
    | "runtime-close"
    | "runtime-different"
    | "previous-correction"
    | "ambiguous-results";
  readonly points: number;
  readonly explanation: string;
}

export interface ScoredTmdbCandidate {
  readonly candidate: TmdbMovieCandidate;
  /** Auditable heuristic score. This is deliberately not a probability. */
  readonly score: number;
  readonly band: MatchBand;
  readonly components: readonly MatchScoreComponent[];
}

export interface RankedTmdbCandidates {
  readonly candidates: readonly ScoredTmdbCandidate[];
  readonly autoSelectedId?: number;
}

export interface MatchScoreThresholds {
  readonly high: number;
  readonly medium: number;
  readonly minimumLead: number;
}

export interface MatchScoringOptions {
  readonly thresholds?: Partial<MatchScoreThresholds>;
}

const DEFAULT_THRESHOLDS: MatchScoreThresholds = {
  high: 80,
  medium: 50,
  minimumLead: 20,
};

export const normalizeMovieTitle = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("und")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");

const levenshteinDistance = (left: string, right: string): number => {
  const segmenter = new Intl.Segmenter("und", { granularity: "grapheme" });
  const leftCharacters = Array.from(segmenter.segment(left), ({ segment }) => segment);
  const rightCharacters = Array.from(segmenter.segment(right), ({ segment }) => segment);
  let previous = Array.from({ length: rightCharacters.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= leftCharacters.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= rightCharacters.length; rightIndex += 1) {
      const substitutionCost =
        leftCharacters[leftIndex - 1] === rightCharacters[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        (current[rightIndex - 1] ?? Number.POSITIVE_INFINITY) + 1,
        (previous[rightIndex] ?? Number.POSITIVE_INFINITY) + 1,
        (previous[rightIndex - 1] ?? Number.POSITIVE_INFINITY) + substitutionCost,
      );
    }
    previous = current;
  }

  return previous[rightCharacters.length] ?? 0;
};

export const movieTitleSimilarity = (left: string, right: string): number => {
  const normalizedLeft = normalizeMovieTitle(left);
  const normalizedRight = normalizeMovieTitle(right);
  const segmenter = new Intl.Segmenter("und", { granularity: "grapheme" });
  const length = Math.max(
    Array.from(segmenter.segment(normalizedLeft)).length,
    Array.from(segmenter.segment(normalizedRight)).length,
  );
  if (length === 0) return 1;
  return 1 - levenshteinDistance(normalizedLeft, normalizedRight) / length;
};

interface RawScore {
  readonly candidate: TmdbMovieCandidate;
  readonly score: number;
  readonly components: readonly MatchScoreComponent[];
}

const scoreRawCandidate = (query: TmdbMatchQuery, candidate: TmdbMovieCandidate): RawScore => {
  const components: MatchScoreComponent[] = [];
  const queryTitle = normalizeMovieTitle(query.title);
  const candidateTitle = normalizeMovieTitle(candidate.title);
  const originalTitle = normalizeMovieTitle(candidate.originalTitle ?? "");
  const alternatives = (candidate.alternativeTitles ?? []).map(normalizeMovieTitle);

  if (queryTitle === candidateTitle) {
    components.push({ code: "title-exact", points: 50, explanation: "Título exacto: +50" });
  } else {
    const similarity = movieTitleSimilarity(query.title, candidate.title);
    const points = Math.round(similarity * 40);
    components.push({
      code: "title-similar",
      points,
      explanation: `Similitud de título ${Math.round(similarity * 100)}/100: +${points}`,
    });
  }

  if (originalTitle.length > 0 && queryTitle === originalTitle && queryTitle !== candidateTitle) {
    components.push({
      code: "original-title-exact",
      points: 15,
      explanation: "Título original exacto: +15",
    });
  }
  if (alternatives.includes(queryTitle)) {
    components.push({
      code: "alternative-title-exact",
      points: 10,
      explanation: "Título alternativo exacto: +10",
    });
  }

  if (query.year !== undefined && candidate.releaseYear !== undefined) {
    const difference = Math.abs(query.year - candidate.releaseYear);
    if (difference === 0) {
      components.push({ code: "year-exact", points: 30, explanation: "Año exacto: +30" });
    } else if (difference === 1) {
      components.push({ code: "year-close", points: 5, explanation: "Año adyacente: +5" });
    } else {
      const points = -Math.min(30, difference * 10);
      components.push({
        code: "year-different",
        points,
        explanation: `Año diferente (${difference}): ${points}`,
      });
    }
  }

  // La duración es la señal que separa remakes, cortos y episodios sueltos de la
  // película homónima. Se mide en proporción, no en minutos absolutos: 10 min de
  // diferencia no significan lo mismo en un corto que en una película de 3 horas.
  const candidateRuntime = candidate.runtimeMinutes;
  if (
    query.runtimeMinutes !== undefined &&
    candidateRuntime !== undefined &&
    candidateRuntime > 0
  ) {
    const deviation = Math.abs(candidateRuntime - query.runtimeMinutes) / candidateRuntime;
    if (deviation <= 0.05) {
      components.push({
        code: "runtime-compatible",
        points: 30,
        explanation: `Duración compatible (${String(candidateRuntime)} min): +30`,
      });
    } else if (deviation > 0.2) {
      components.push({
        code: "runtime-different",
        points: -40,
        explanation: `Duración muy distinta (${String(candidateRuntime)} min frente a ${String(query.runtimeMinutes)} min): -40`,
      });
    } else {
      components.push({
        code: "runtime-close",
        points: 10,
        explanation: `Duración parecida (${String(candidateRuntime)} min): +10`,
      });
    }
  }

  // Que el idioma original de la obra esté entre las pistas es una confirmación
  // barata: un WEB-DL español de una película inglesa casi siempre trae el inglés.
  const originalLanguage = candidate.originalLanguage?.toLowerCase();
  if (
    originalLanguage !== undefined &&
    query.audioLanguages?.some((language) => language.toLowerCase() === originalLanguage) === true
  ) {
    components.push({
      code: "original-language-present",
      points: 10,
      explanation: `El idioma original (${originalLanguage}) está entre las pistas: +10`,
    });
  }

  // El proveedor ordena por relevancia y popularidad. Es una señal débil, pero
  // desempata cuando el título por sí solo es ambiguo («Venom 2», «Capitan America»).
  const order = candidate.providerOrder;
  if (order !== undefined && order < 3) {
    const points = [8, 5, 3][order] ?? 0;
    components.push({
      code: "provider-relevance",
      points,
      explanation: `Resultado n.º ${String(order + 1)} por relevancia en el proveedor: +${String(points)}`,
    });
  }

  if (query.previouslySelectedTmdbId === candidate.id) {
    components.push({
      code: "previous-correction",
      points: 40,
      explanation: "Corrección previa del usuario: +40",
    });
  }

  return {
    candidate,
    score: components.reduce((total, component) => total + component.points, 0),
    components,
  };
};

const bandFor = (
  score: number,
  marginFromRunnerUp: number,
  thresholds: MatchScoreThresholds,
): MatchBand => {
  if (score >= thresholds.high && marginFromRunnerUp >= thresholds.minimumLead) return "high";
  if (score >= thresholds.medium) return "medium";
  return "low";
};

export const rankTmdbCandidates = (
  query: TmdbMatchQuery,
  candidates: readonly TmdbMovieCandidate[],
  options: MatchScoringOptions = {},
): RankedTmdbCandidates => {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...options.thresholds };
  const raw = candidates
    .map((candidate) => scoreRawCandidate(query, candidate))
    .sort((left, right) => right.score - left.score || left.candidate.id - right.candidate.id);
  const leadingScore = raw[0]?.score;
  const similarCount =
    leadingScore === undefined
      ? 0
      : raw.filter((candidate) => leadingScore - candidate.score <= 10).length;
  const ambiguityPenalty = similarCount > 1 ? -Math.min(20, (similarCount - 1) * 10) : 0;
  const adjusted = raw
    .map((entry) => ({
      ...entry,
      score: entry.score + ambiguityPenalty,
      components:
        ambiguityPenalty === 0
          ? entry.components
          : [
              ...entry.components,
              {
                code: "ambiguous-results" as const,
                points: ambiguityPenalty,
                explanation: `${similarCount} resultados similares: ${ambiguityPenalty}`,
              },
            ],
    }))
    .sort((left, right) => right.score - left.score || left.candidate.id - right.candidate.id);

  const scored = adjusted.map<ScoredTmdbCandidate>((entry, index) => {
    const runnerUpScore = index === 0 ? adjusted[1]?.score : adjusted[0]?.score;
    const margin =
      runnerUpScore === undefined ? Number.POSITIVE_INFINITY : entry.score - runnerUpScore;
    return {
      candidate: entry.candidate,
      score: entry.score,
      components: entry.components,
      band: bandFor(entry.score, margin, thresholds),
    };
  });
  const first = scored[0];

  return {
    candidates: scored,
    ...(first?.band === "high" ? { autoSelectedId: first.candidate.id } : {}),
  };
};

export const scoreTmdbCandidate = (
  query: TmdbMatchQuery,
  candidate: TmdbMovieCandidate,
  options: MatchScoringOptions = {},
): ScoredTmdbCandidate => {
  const scored = rankTmdbCandidates(query, [candidate], options).candidates[0];
  if (scored === undefined) {
    throw new Error("No se pudo puntuar el candidato proporcionado.");
  }
  return scored;
};
