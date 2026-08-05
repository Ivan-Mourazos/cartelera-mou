import {
  ArrowDown,
  ArrowUp,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  MonitorCog,
  Palette,
  Save,
  ScanLine,
  Settings2,
  Tags,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "../../components/Button";
import { Notice } from "../../components/Notice";
import { ScreenHeader } from "../../components/ScreenHeader";
import { SpliceBand } from "../../components/SpliceBand";
import { TmdbAttribution } from "../../components/TmdbAttribution";
import type {
  AppSettings,
  DesktopGateway,
  FfprobeValidation,
  NamingTag,
  NamingToken,
  SaveSettingsRequest,
} from "../../services/types";

type SettingsSection = "general" | "analysis" | "metadata" | "naming" | "appearance";

const SECTIONS: { id: SettingsSection; label: string; icon: typeof Settings2 }[] = [
  { id: "general", label: "General", icon: Settings2 },
  { id: "analysis", label: "Análisis", icon: ScanLine },
  { id: "metadata", label: "Metadatos", icon: KeyRound },
  { id: "naming", label: "Nombres", icon: Tags },
  { id: "appearance", label: "Apariencia", icon: Palette },
];

const TAG_LABELS: Record<NamingTag, string> = {
  resolution: "Resolución",
  source: "Fuente",
  releaseType: "Tipo de lanzamiento",
  videoCodec: "Códec de vídeo",
  bitDepth: "Profundidad de color",
  dolbyVision: "Dolby Vision",
  dolbyVisionProfile: "Perfil de Dolby Vision",
  hdr: "HDR10 / HDR10+",
  audioCodec: "Códec principal de audio",
  spatialAudio: "Audio espacial",
  channels: "Canales",
  audioLanguages: "Idiomas de audio",
  subtitles: "Subtítulos",
  edition: "Edición especial",
  identifier: "Identificador opcional",
};

const PREVIEW_VALUES: Partial<Record<NamingTag, string>> = {
  resolution: "[2160p]",
  source: "[UHD Blu-ray]",
  releaseType: "[REMUX]",
  videoCodec: "[HEVC]",
  bitDepth: "[10-bit]",
  dolbyVision: "[Dolby Vision]",
  dolbyVisionProfile: "[Profile 8]",
  hdr: "[HDR10]",
  audioCodec: "[TrueHD]",
  spatialAudio: "[Atmos]",
  channels: "[7.1]",
  audioLanguages: "[ES] [EN]",
  subtitles: "[SUB ES]",
  edition: "[IMAX]",
  identifier: "[ID-693134]",
};

function previewFor(settings: AppSettings): { filename: string; tokens: NamingToken[] } {
  const tokens: NamingToken[] = [
    { id: "title", label: "Dune - Parte dos", source: "tmdb", kind: "title", edited: false },
    { id: "year", label: "(2024)", source: "tmdb", kind: "year", edited: false },
  ];
  for (const tag of settings.tagOrder) {
    if (!settings.enabledTags.includes(tag)) continue;
    if (tag === "identifier" && !settings.includeIdentifier) continue;
    const label = PREVIEW_VALUES[tag];
    if (!label) continue;
    tokens.push({
      id: tag,
      label,
      source:
        tag === "source" || tag === "releaseType" || tag === "edition" ? "filename" : "ffprobe",
      kind: "tag",
      edited: false,
    });
  }
  tokens.push({
    id: "extension",
    label: ".mkv",
    source: "filename",
    kind: "extension",
    edited: false,
  });
  return {
    filename: tokens
      .map(
        (token, index) =>
          `${index === 0 ? "" : token.kind === "extension" ? "" : " "}${token.label}`,
      )
      .join(""),
    tokens,
  };
}

interface SettingsScreenProps {
  gateway: DesktopGateway;
  settings: AppSettings;
  onSaved: (settings: AppSettings) => void;
}

export function SettingsScreen({ gateway, settings, onSaved }: SettingsScreenProps) {
  const [section, setSection] = useState<SettingsSection>("general");
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [tmdbToken, setTmdbToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<FfprobeValidation | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  const dirty = useMemo(
    () => Boolean(JSON.stringify(draft) !== JSON.stringify(settings) || tmdbToken.trim()),
    [draft, settings, tmdbToken],
  );
  const preview = useMemo(() => previewFor(draft), [draft]);

  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function moveTag(tag: NamingTag, direction: -1 | 1) {
    setDraft((current) => {
      const index = current.tagOrder.indexOf(tag);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.tagOrder.length) return current;
      const tagOrder = [...current.tagOrder];
      const currentTag = tagOrder[index];
      const targetTag = tagOrder[nextIndex];
      if (!currentTag || !targetTag) return current;
      tagOrder[index] = targetTag;
      tagOrder[nextIndex] = currentTag;
      return { ...current, tagOrder };
    });
  }

  function toggleTag(tag: NamingTag) {
    setDraft((current) => {
      const enabledTags = current.enabledTags.includes(tag)
        ? current.enabledTags.filter((currentTag) => currentTag !== tag)
        : [...current.enabledTags, tag];
      return { ...current, enabledTags };
    });
  }

  async function validateFfprobe() {
    setValidating(true);
    setValidation(null);
    try {
      setValidation(await gateway.validateFfprobe(draft.ffprobePath));
    } catch (cause) {
      setNotice({
        tone: "error",
        message: cause instanceof Error ? cause.message : "No se pudo validar ffprobe.",
      });
    } finally {
      setValidating(false);
    }
  }

  async function save() {
    setSaving(true);
    setNotice(null);
    try {
      const request: SaveSettingsRequest = tmdbToken.trim()
        ? { ...draft, tmdbToken: tmdbToken.trim() }
        : draft;
      const saved = await gateway.saveSettings(request);
      setDraft(saved);
      setTmdbToken("");
      setShowToken(false);
      onSaved(saved);
      setNotice({ tone: "success", message: "Los ajustes se guardaron en este dispositivo." });
    } catch (cause) {
      setNotice({
        tone: "error",
        message: cause instanceof Error ? cause.message : "No se pudieron guardar los ajustes.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="screen settings-screen">
      <ScreenHeader
        eyebrow="Preferencias locales"
        title="Ajustes"
        description="Configura el análisis y la nomenclatura sin exponer credenciales al frontend."
        actions={
          <Button
            variant="primary"
            leadingIcon={<Save size={17} />}
            disabled={!dirty || saving}
            onClick={() => void save()}
          >
            {saving ? "Guardando…" : "Guardar cambios"}
          </Button>
        }
      />

      {notice ? (
        <Notice
          tone={notice.tone}
          title={notice.tone === "success" ? "Ajustes guardados" : "No se guardaron los cambios"}
          message={notice.message}
          onDismiss={() => setNotice(null)}
        />
      ) : null}

      <div className="settings-layout">
        <nav className="settings-index" aria-label="Secciones de ajustes">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={section === id ? "is-active" : ""}
              aria-current={section === id ? "page" : undefined}
              onClick={() => setSection(id)}
            >
              <Icon size={17} aria-hidden="true" /> {label}
            </button>
          ))}
        </nav>

        <div className="settings-content">
          {section === "general" ? (
            <section className="settings-section">
              <div className="settings-section__heading">
                <MonitorCog size={20} />
                <div>
                  <h2>General</h2>
                  <p>Idioma y región usados para títulos y resultados.</p>
                </div>
              </div>
              <div className="form-grid">
                <label className="field">
                  <span>Idioma preferido para títulos</span>
                  <select
                    value={draft.titleLanguage}
                    onChange={(event) => update("titleLanguage", event.target.value)}
                  >
                    <option value="es-ES">Español</option>
                    <option value="gl-ES">Galego</option>
                    <option value="en-US">English</option>
                  </select>
                </label>
                <label className="field">
                  <span>País o región</span>
                  <select
                    value={draft.region}
                    onChange={(event) => update("region", event.target.value)}
                  >
                    <option value="ES">España</option>
                    <option value="MX">México</option>
                    <option value="AR">Argentina</option>
                    <option value="US">Estados Unidos</option>
                  </select>
                </label>
              </div>
              <div className="settings-note">
                <Check size={17} />
                <p>
                  <strong>Local-first</strong> Estos valores se guardan solo en el dispositivo y no
                  requieren una cuenta.
                </p>
              </div>
            </section>
          ) : null}

          {section === "analysis" ? (
            <section className="settings-section">
              <div className="settings-section__heading">
                <ScanLine size={20} />
                <div>
                  <h2>Análisis técnico</h2>
                  <p>Selecciona o detecta la instalación local de ffprobe.</p>
                </div>
              </div>
              <label className="field">
                <span>Ruta de ffprobe</span>
                <div className="field-with-action">
                  <input
                    value={draft.ffprobePath}
                    onChange={(event) => {
                      update("ffprobePath", event.target.value);
                      setValidation(null);
                    }}
                    placeholder="Detección automática"
                    spellCheck={false}
                  />
                  <Button onClick={() => void validateFfprobe()} disabled={validating}>
                    {validating ? "Validando…" : "Validar"}
                  </Button>
                </div>
                <small>Déjala vacía para buscar ffprobe automáticamente en el sistema.</small>
              </label>
              {validation ? (
                <Notice
                  tone={validation.valid ? "success" : "error"}
                  title={validation.valid ? "ffprobe disponible" : "ffprobe no disponible"}
                  message={`${validation.message}${validation.version ? ` Versión ${validation.version}.` : ""}`}
                />
              ) : null}
            </section>
          ) : null}

          {section === "metadata" ? (
            <section className="settings-section">
              <div className="settings-section__heading">
                <KeyRound size={20} />
                <div>
                  <h2>Metadatos de TMDb</h2>
                  <p>La credencial se envía al backend local y nunca vuelve a esta pantalla.</p>
                </div>
              </div>
              <div className={`credential-status ${draft.tmdbConfigured ? "is-configured" : ""}`}>
                <span aria-hidden="true" />
                <div>
                  <strong>
                    {draft.tmdbConfigured ? "Credencial configurada" : "Sin credencial configurada"}
                  </strong>
                  <p>
                    {draft.tmdbCredentialSource === "environment"
                      ? "Leída del entorno local."
                      : draft.tmdbCredentialSource === "session"
                        ? "Disponible solo durante esta sesión."
                        : "Puedes trabajar sin conexión con el parser de nombres."}
                  </p>
                </div>
              </div>
              <label className="field">
                <span>TMDb Read Access Token</span>
                <div className="password-field">
                  <input
                    type={showToken ? "text" : "password"}
                    value={tmdbToken}
                    onChange={(event) => setTmdbToken(event.target.value)}
                    placeholder={
                      draft.tmdbConfigured
                        ? "Introduce otro token para sustituirlo"
                        : "Introduce el token"
                    }
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={showToken ? "Ocultar token" : "Mostrar token"}
                    onClick={() => setShowToken((value) => !value)}
                  >
                    {showToken ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
                <small>El valor no se incluye en logs ni en respuestas IPC.</small>
              </label>
              <div className="settings-credit">
                <strong>Créditos de datos</strong>
                <TmdbAttribution />
              </div>
            </section>
          ) : null}

          {section === "naming" ? (
            <section className="settings-section settings-section--wide">
              <div className="settings-section__heading">
                <Tags size={20} />
                <div>
                  <h2>Sistema de nombres</h2>
                  <p>Activa y ordena cada característica como un bloque independiente.</p>
                </div>
              </div>
              <label className="field">
                <span>Plantilla</span>
                <input
                  value={draft.namingTemplate}
                  onChange={(event) => update("namingTemplate", event.target.value)}
                  spellCheck={false}
                />
                <small>
                  Variables disponibles: {"{title}"}, {"{year}"} y {"{tags}"}.
                </small>
              </label>
              <label className="range-field">
                <span>Umbral de preselección</span>
                <strong>{draft.matchThreshold} puntos</strong>
                <input
                  type="range"
                  min={50}
                  max={100}
                  step={1}
                  value={draft.matchThreshold}
                  onChange={(event) => update("matchThreshold", Number(event.target.value))}
                />
              </label>
              <label className="toggle-row">
                <span>
                  <strong>Incluir identificador</strong>
                  <small>Añade [ID-…] al final. Permanece desactivado por defecto.</small>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={draft.includeIdentifier}
                  onChange={(event) => update("includeIdentifier", event.target.checked)}
                />
              </label>
              <SpliceBand
                currentName="Dune.Part.Two.2024.MULTi.2160p.REMUX.mkv"
                proposedName={preview.filename}
                tokens={preview.tokens}
              />
              <div className="tag-order" aria-label="Orden de etiquetas">
                {draft.tagOrder.map((tag, index) => (
                  <div className="tag-order__row" key={tag}>
                    <span className="tag-order__position">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <label>
                      <input
                        type="checkbox"
                        checked={draft.enabledTags.includes(tag)}
                        onChange={() => toggleTag(tag)}
                      />{" "}
                      <span>{TAG_LABELS[tag]}</span>
                    </label>
                    <div>
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => moveTag(tag, -1)}
                        disabled={index === 0}
                        aria-label={`Mover ${TAG_LABELS[tag]} arriba`}
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => moveTag(tag, 1)}
                        disabled={index === draft.tagOrder.length - 1}
                        aria-label={`Mover ${TAG_LABELS[tag]} abajo`}
                      >
                        <ArrowDown size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {section === "appearance" ? (
            <section className="settings-section">
              <div className="settings-section__heading">
                <Palette size={20} />
                <div>
                  <h2>Apariencia</h2>
                  <p>El tema oscuro es el predeterminado; el modo del sistema sigue Windows.</p>
                </div>
              </div>
              <fieldset className="theme-picker">
                <legend>Tema</legend>
                {(["dark", "light", "system"] as const).map((theme) => (
                  <label key={theme} className={draft.theme === theme ? "is-selected" : ""}>
                    <input
                      type="radio"
                      name="theme"
                      value={theme}
                      checked={draft.theme === theme}
                      onChange={() => update("theme", theme)}
                    />
                    <span className={`theme-swatch theme-swatch--${theme}`} aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                    <strong>
                      {theme === "dark" ? "Oscuro" : theme === "light" ? "Claro" : "Del sistema"}
                    </strong>
                  </label>
                ))}
              </fieldset>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
