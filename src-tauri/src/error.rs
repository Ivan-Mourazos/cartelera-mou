use serde::Serialize;

pub type BackendResult<T> = Result<T, BackendError>;

#[derive(Debug, thiserror::Error)]
pub enum BackendError {
    #[error("entrada no válida: {0}")]
    InvalidInput(String),
    #[error("no encontrado: {0}")]
    NotFound(String),
    #[error("conflicto: {0}")]
    Conflict(String),
    #[error("ffprobe: {0}")]
    Ffprobe(String),
    #[error("error de E/S: {0}")]
    Io(#[from] std::io::Error),
    #[error("error de base de datos: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("JSON no válido: {0}")]
    Json(#[from] serde_json::Error),
    #[error("servicio remoto: {0}")]
    Network(#[from] reqwest::Error),
    #[error("estado interno no disponible: {0}")]
    State(String),
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiError {
    pub code: &'static str,
    pub message: String,
}

impl From<BackendError> for ApiError {
    fn from(value: BackendError) -> Self {
        let code = match value {
            BackendError::InvalidInput(_) => "invalidInput",
            BackendError::NotFound(_) => "notFound",
            BackendError::Conflict(_) => "conflict",
            BackendError::Ffprobe(_) => "ffprobeError",
            BackendError::Io(_) => "ioError",
            BackendError::Database(_) => "databaseError",
            BackendError::Json(_) => "invalidJson",
            BackendError::Network(_) => "networkError",
            BackendError::State(_) => "stateError",
        };

        Self {
            code,
            message: value.to_string(),
        }
    }
}
