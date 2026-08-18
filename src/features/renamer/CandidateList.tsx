import type { ProviderCandidateSummary } from "../../domain/identification/types";

export interface CandidateListProps {
  readonly candidates: readonly ProviderCandidateSummary[];
  readonly appliedId: number | undefined;
  readonly onChoose: (candidate: ProviderCandidateSummary) => void;
}

/**
 * Alternativas devueltas por el proveedor.
 *
 * Se muestran siempre que existan: la puntuación puede equivocarse y cambiar la
 * elección tiene que costar un clic, no una búsqueda a mano.
 */
export const CandidateList = ({ candidates, appliedId, onChoose }: CandidateListProps) => {
  if (candidates.length === 0) return null;

  return (
    <ul className="candidate-list">
      {candidates.map((candidate) => (
        <li key={candidate.id}>
          <button
            type="button"
            className={candidate.id === appliedId ? "is-applied" : ""}
            onClick={() => {
              onChoose(candidate);
            }}
            title={candidate.components.map((component) => component.explanation).join("\n")}
          >
            {candidate.posterUrl === undefined ? (
              <span className="candidate-poster-placeholder" aria-hidden />
            ) : (
              <img src={candidate.posterUrl} alt="" loading="lazy" />
            )}
            <span className="candidate-text">
              <strong>{candidate.spanishTitle}</strong> ({candidate.year ?? "—"})
              {candidate.originalTitle === candidate.spanishTitle ? null : (
                <em> · {candidate.originalTitle}</em>
              )}
            </span>
            <span className={`candidate-band band-${candidate.band}`}>{candidate.score}</span>
          </button>
        </li>
      ))}
    </ul>
  );
};
