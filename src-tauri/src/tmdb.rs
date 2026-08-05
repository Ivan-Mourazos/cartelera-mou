use crate::error::{BackendError, BackendResult};
use crate::models::{
    ScoreReason, TmdbCandidate, TmdbSearchRequest, VerifiedAlternativeTitle, VerifiedGenre,
    VerifiedMovieMetadata,
};
use reqwest::Client;
use serde::Deserialize;
use std::collections::HashSet;
use std::sync::RwLock;
use std::time::Duration;

const TMDB_SEARCH_URL: &str = "https://api.themoviedb.org/3/search/movie";
const TMDB_MOVIE_URL: &str = "https://api.themoviedb.org/3/movie";
const TMDB_IMAGE_BASE: &str = "https://image.tmdb.org/t/p/w500";

pub struct TmdbService {
    client: Client,
    session_token: RwLock<Option<String>>,
    environment_token: Option<String>,
}

impl TmdbService {
    pub fn new() -> BackendResult<Self> {
        let client = Client::builder()
            .timeout(Duration::from_secs(15))
            .user_agent("CineVault/0.1")
            .build()?;
        let environment_token = std::env::var("TMDB_READ_ACCESS_TOKEN")
            .ok()
            .map(|value| value.trim().to_owned())
            .filter(|value| !value.is_empty());
        Ok(Self {
            client,
            session_token: RwLock::new(None),
            environment_token,
        })
    }

    pub fn set_session_token(&self, token: Option<&str>) -> BackendResult<()> {
        let token = token
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_owned);
        *self.session_token.write().map_err(|_| {
            BackendError::State("el bloqueo de la credencial está contaminado".into())
        })? = token;
        Ok(())
    }

    fn credential(&self) -> BackendResult<(Option<String>, &'static str)> {
        if let Some(token) = self
            .session_token
            .read()
            .map_err(|_| {
                BackendError::State("el bloqueo de la credencial está contaminado".into())
            })?
            .clone()
        {
            return Ok((Some(token), "session"));
        }
        if let Some(token) = self.environment_token.clone() {
            return Ok((Some(token), "environment"));
        }
        Ok((None, "none"))
    }

    pub fn credential_status(&self) -> BackendResult<(bool, &'static str)> {
        let (credential, source) = self.credential()?;
        Ok((credential.is_some(), source))
    }

    pub async fn search(
        &self,
        request: &TmdbSearchRequest,
        match_threshold: i32,
    ) -> BackendResult<Vec<TmdbCandidate>> {
        let query = request.query.trim();
        if query.is_empty() {
            return Err(BackendError::InvalidInput(
                "la búsqueda de TMDb no puede estar vacía".into(),
            ));
        }
        let (token, _) = self.credential()?;
        let Some(token) = token else {
            tracing::info!(
                operation = "tmdb_search",
                mode = "offline",
                "TMDb no está configurado"
            );
            return Ok(Vec::new());
        };
        let region = normalized_region(&request.region)?;

        let mut query_parameters = vec![
            ("query", query.to_owned()),
            ("language", request.language.clone()),
            ("region", region),
            ("include_adult", "false".into()),
        ];
        if let Some(year) = request.year {
            query_parameters.push(("primary_release_year", year.to_string()));
        }
        let response = self
            .client
            .get(TMDB_SEARCH_URL)
            .bearer_auth(token)
            .query(&query_parameters)
            .send()
            .await?
            .error_for_status()?
            .json::<SearchResponse>()
            .await?;

        let mut candidates = response
            .results
            .into_iter()
            .take(20)
            .map(|result| candidate_from_result(query, request.year, match_threshold, result))
            .collect::<Vec<_>>();
        candidates.sort_by(|left, right| {
            right
                .match_score
                .cmp(&left.match_score)
                .then_with(|| left.title.cmp(&right.title))
        });
        if candidates.len() > 1
            && candidates[0]
                .match_score
                .saturating_sub(candidates[1].match_score)
                < 10
        {
            let top_score = candidates[0].match_score;
            for candidate in candidates
                .iter_mut()
                .take_while(|candidate| top_score.saturating_sub(candidate.match_score) < 10)
            {
                candidate.match_score = (candidate.match_score - 10).max(0);
                candidate.score_reasons.push(ScoreReason {
                    label: "Varios resultados muy similares".into(),
                    points: -10,
                });
                candidate.match_level = match_level(candidate.match_score, match_threshold).into();
            }
        }
        Ok(candidates)
    }

    pub async fn movie_details(
        &self,
        tmdb_id: i64,
        language: &str,
    ) -> BackendResult<VerifiedMovieMetadata> {
        if !(1..=i64::from(i32::MAX)).contains(&tmdb_id) {
            return Err(BackendError::InvalidInput(
                "el identificador TMDb seleccionado no es válido".into(),
            ));
        }
        let (token, _) = self.credential()?;
        let token = token.ok_or_else(|| {
            BackendError::InvalidInput(
                "TMDb debe estar configurado para verificar la identificación".into(),
            )
        })?;
        let language = if language.trim().is_empty() {
            "es-ES"
        } else {
            language.trim()
        };
        let response = self
            .client
            .get(format!("{TMDB_MOVIE_URL}/{tmdb_id}"))
            .bearer_auth(token)
            .query(&[
                ("language", language),
                ("append_to_response", "alternative_titles"),
            ])
            .send()
            .await?
            .error_for_status()?
            .json::<MovieDetailsResponse>()
            .await?;
        verified_from_details(tmdb_id, response)
    }
}

#[derive(Debug, Deserialize)]
struct SearchResponse {
    #[serde(default)]
    results: Vec<SearchResult>,
}

#[derive(Debug, Deserialize)]
struct SearchResult {
    id: i64,
    title: String,
    #[serde(default)]
    original_title: String,
    release_date: Option<String>,
    overview: Option<String>,
    poster_path: Option<String>,
}

#[derive(Debug, Deserialize)]
struct MovieDetailsResponse {
    id: i64,
    title: String,
    #[serde(default)]
    original_title: String,
    release_date: Option<String>,
    overview: Option<String>,
    runtime: Option<i64>,
    #[serde(default)]
    genres: Vec<DetailsGenre>,
    poster_path: Option<String>,
    backdrop_path: Option<String>,
    belongs_to_collection: Option<DetailsCollection>,
    original_language: Option<String>,
    #[serde(default)]
    alternative_titles: AlternativeTitlesResponse,
}

#[derive(Debug, Deserialize)]
struct DetailsGenre {
    id: i64,
    name: String,
}

#[derive(Debug, Deserialize)]
struct DetailsCollection {
    id: i64,
    name: String,
}

#[derive(Debug, Default, Deserialize)]
struct AlternativeTitlesResponse {
    #[serde(default)]
    titles: Vec<DetailsAlternativeTitle>,
}

#[derive(Debug, Deserialize)]
struct DetailsAlternativeTitle {
    iso_3166_1: Option<String>,
    title: String,
    #[serde(rename = "type")]
    title_type: Option<String>,
}

fn verified_from_details(
    expected_tmdb_id: i64,
    details: MovieDetailsResponse,
) -> BackendResult<VerifiedMovieMetadata> {
    if details.id != expected_tmdb_id || details.title.trim().is_empty() {
        return Err(BackendError::State(
            "TMDb devolvió detalles que no corresponden a la selección".into(),
        ));
    }
    let mut genre_ids = HashSet::new();
    let genres = details
        .genres
        .into_iter()
        .filter(|genre| genre.id > 0 && !genre.name.trim().is_empty())
        .filter(|genre| genre_ids.insert(genre.id))
        .map(|genre| VerifiedGenre {
            id: genre.id,
            name: genre.name.trim().to_owned(),
        })
        .collect();
    let mut alternative_title_keys = HashSet::new();
    let alternative_titles = details
        .alternative_titles
        .titles
        .into_iter()
        .filter(|alternative| !alternative.title.trim().is_empty())
        .filter_map(|alternative| {
            let iso_3166_1 = non_empty(alternative.iso_3166_1);
            let title = alternative.title.trim().to_owned();
            alternative_title_keys
                .insert((iso_3166_1.clone(), title.clone()))
                .then_some(VerifiedAlternativeTitle {
                    iso_3166_1,
                    title,
                    title_type: non_empty(alternative.title_type),
                })
        })
        .collect();
    let collection = details
        .belongs_to_collection
        .filter(|collection| collection.id > 0 && !collection.name.trim().is_empty());
    Ok(VerifiedMovieMetadata {
        tmdb_id: details.id,
        title: details.title.trim().to_owned(),
        original_title: non_empty(Some(details.original_title)),
        release_date: non_empty(details.release_date),
        overview: non_empty(details.overview),
        runtime_minutes: details.runtime.filter(|runtime| *runtime > 0),
        genres,
        poster_path: valid_image_path(details.poster_path),
        backdrop_path: valid_image_path(details.backdrop_path),
        collection_id: collection.as_ref().map(|collection| collection.id),
        collection_name: collection.map(|collection| collection.name.trim().to_owned()),
        original_language: non_empty(details.original_language),
        alternative_titles,
    })
}

fn non_empty(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn valid_image_path(path: Option<String>) -> Option<String> {
    path.filter(|path| path.starts_with('/') && !path.contains(".."))
}

fn normalized_region(region: &str) -> BackendResult<String> {
    let region = region.trim();
    if region.len() != 2 || !region.bytes().all(|byte| byte.is_ascii_alphabetic()) {
        return Err(BackendError::InvalidInput(
            "la región TMDb debe ser un código ISO 3166-1 de dos letras".into(),
        ));
    }
    Ok(region.to_ascii_uppercase())
}

fn candidate_from_result(
    query: &str,
    expected_year: Option<i32>,
    match_threshold: i32,
    result: SearchResult,
) -> TmdbCandidate {
    let normalized_query = normalize_title(query);
    let localized = normalize_title(&result.title);
    let original = normalize_title(&result.original_title);
    let mut reasons = Vec::new();
    let title_score = if normalized_query == localized {
        reasons.push(ScoreReason {
            label: "Título localizado exacto".into(),
            points: 50,
        });
        50
    } else if normalized_query == original {
        reasons.push(ScoreReason {
            label: "Título original exacto".into(),
            points: 45,
        });
        45
    } else {
        let overlap = token_overlap(&normalized_query, &localized)
            .max(token_overlap(&normalized_query, &original));
        let points = (overlap * 40.0).round() as i32;
        reasons.push(ScoreReason {
            label: "Similitud de palabras del título".into(),
            points,
        });
        points
    };
    let year = result
        .release_date
        .as_deref()
        .and_then(|date| date.get(0..4))
        .and_then(|year| year.parse::<i32>().ok());
    let year_score = match (expected_year, year) {
        (Some(expected), Some(actual)) if expected == actual => {
            reasons.push(ScoreReason {
                label: "Año exacto".into(),
                points: 30,
            });
            30
        }
        (Some(expected), Some(actual)) if (expected - actual).abs() == 1 => {
            reasons.push(ScoreReason {
                label: "Año con diferencia de uno".into(),
                points: 10,
            });
            10
        }
        (Some(_), Some(_)) => {
            reasons.push(ScoreReason {
                label: "Año diferente".into(),
                points: -30,
            });
            -30
        }
        _ => 0,
    };
    let match_score = (title_score + year_score).clamp(0, 100);
    TmdbCandidate {
        tmdb_id: result.id,
        title: result.title,
        original_title: result.original_title,
        year,
        overview: result.overview,
        poster_url: result
            .poster_path
            .filter(|path| path.starts_with('/'))
            .map(|path| format!("{TMDB_IMAGE_BASE}{path}")),
        match_score,
        match_level: match_level(match_score, match_threshold).into(),
        score_reasons: reasons,
    }
}

fn normalize_title(value: &str) -> String {
    let mut output = String::new();
    let mut previous_space = false;
    for character in value.chars().flat_map(char::to_lowercase) {
        if character.is_alphanumeric() {
            output.push(character);
            previous_space = false;
        } else if !previous_space && !output.is_empty() {
            output.push(' ');
            previous_space = true;
        }
    }
    output.trim().to_owned()
}

fn token_overlap(left: &str, right: &str) -> f64 {
    let left = left.split_whitespace().collect::<HashSet<_>>();
    let right = right.split_whitespace().collect::<HashSet<_>>();
    if left.is_empty() || right.is_empty() {
        return 0.0;
    }
    let intersection = left.intersection(&right).count() as f64;
    let union = left.union(&right).count() as f64;
    intersection / union
}

fn match_level(score: i32, threshold: i32) -> &'static str {
    if score <= 0 {
        "unmatched"
    } else if score >= threshold.clamp(0, 100) {
        "high"
    } else if score >= threshold.saturating_sub(25).max(1) {
        "medium"
    } else {
        "low"
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn score_is_explainable() {
        let candidate = candidate_from_result(
            "Dune Part Two",
            Some(2024),
            80,
            SearchResult {
                id: 693_134,
                title: "Dune: Part Two".into(),
                original_title: "Dune: Part Two".into(),
                release_date: Some("2024-02-27".into()),
                overview: None,
                poster_path: Some("/poster.jpg".into()),
            },
        );
        assert_eq!(candidate.match_score, 80);
        assert_eq!(candidate.match_level, "high");
        assert!(candidate
            .score_reasons
            .iter()
            .any(|reason| reason.label == "Año exacto"));

        let stricter = candidate_from_result(
            "Dune Part Two",
            Some(2024),
            85,
            SearchResult {
                id: 693_134,
                title: "Dune: Part Two".into(),
                original_title: "Dune: Part Two".into(),
                release_date: Some("2024-02-27".into()),
                overview: None,
                poster_path: None,
            },
        );
        assert_eq!(stricter.match_score, 80);
        assert_eq!(stricter.match_level, "medium");
    }

    #[test]
    fn details_response_is_verified_and_normalized_before_persistence() {
        let details: MovieDetailsResponse = serde_json::from_value(json!({
            "id": 693134,
            "title": "Dune: Parte dos",
            "original_title": "Dune: Part Two",
            "release_date": "2024-02-27",
            "overview": "Arrakis",
            "runtime": 166,
            "genres": [
                {"id": 878, "name": "Ciencia ficción"},
                {"id": 878, "name": "Duplicado"}
            ],
            "poster_path": "/poster.jpg",
            "backdrop_path": "/backdrop.jpg",
            "belongs_to_collection": {"id": 726871, "name": "Dune"},
            "original_language": "en",
            "alternative_titles": {"titles": [
                {"iso_3166_1": "ES", "title": "Dune: Parte Dos", "type": ""},
                {"iso_3166_1": "ES", "title": "Dune: Parte Dos", "type": ""}
            ]}
        }))
        .unwrap();

        let verified = verified_from_details(693_134, details).unwrap();
        assert_eq!(verified.tmdb_id, 693_134);
        assert_eq!(verified.runtime_minutes, Some(166));
        assert_eq!(verified.genres.len(), 1);
        assert_eq!(verified.alternative_titles.len(), 1);
        assert_eq!(verified.alternative_titles[0].title_type, None);
        assert_eq!(verified.poster_path.as_deref(), Some("/poster.jpg"));
        assert_eq!(verified.collection_name.as_deref(), Some("Dune"));
    }

    #[test]
    fn details_response_with_different_id_is_rejected() {
        let details: MovieDetailsResponse = serde_json::from_value(json!({
            "id": 2,
            "title": "Wrong",
            "genres": [],
            "alternative_titles": {"titles": []}
        }))
        .unwrap();
        assert!(verified_from_details(1, details).is_err());
    }

    #[test]
    fn region_is_normalized_and_rejects_non_iso_values() {
        assert_eq!(normalized_region("es").unwrap(), "ES");
        assert!(normalized_region("ESP").is_err());
        assert!(normalized_region("E1").is_err());
    }
}
