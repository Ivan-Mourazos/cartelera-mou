import { useEffect, useRef, useState } from "react";

import { NAME_PRESETS } from "../../domain/naming/presets";
import { ALL_NAME_TOKENS } from "../../domain/naming/template";
import { forgetAllCorrections } from "../../services/learned-corrections";
import type { MetadataProvider } from "../../services/providers/types";
import type { AppSettings } from "../../services/settings";

export interface SettingsPanelProps {
  readonly settings: AppSettings;
  readonly provider: MetadataProvider;
  readonly onChange: (settings: AppSettings) => void;
  readonly onClose: () => void;
}

type KeyCheck = "idle" | "checking" | "valid" | "invalid";

const KEY_CHECK_MESSAGE: Readonly<Record<KeyCheck, string>> = {
  idle: "",
  checking: "Comprobando…",
  valid: "La clave funciona.",
  invalid: "La clave no es válida o TMDb no responde.",
};

/**
 * Ajustes en diálogo modal: overlay, foco atrapado y cierre con Escape.
 *
 * Expone todas las opciones que la aplicación lee de verdad. Las que no lee
 * nadie se han eliminado del esquema en lugar de dibujarlas aquí.
 */
export const SettingsPanel = ({ settings, provider, onChange, onClose }: SettingsPanelProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLSelectElement>(null);
  const [keyCheck, setKeyCheck] = useState<KeyCheck>("idle");

  const patch = (partial: Partial<AppSettings>): void => {
    onChange({ ...settings, ...partial });
  };

  useEffect(() => {
    firstFieldRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      // Trampa de foco: el tabulador no debe salirse del diálogo.
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])',
      );
      if (focusable === undefined || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (first === undefined || last === undefined) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const checkKey = async (): Promise<void> => {
    if (!provider.available) {
      setKeyCheck("invalid");
      return;
    }
    setKeyCheck("checking");
    try {
      await provider.search({ title: "Dune", kind: "movie" });
      setKeyCheck("valid");
    } catch {
      setKeyCheck("invalid");
    }
  };

  const preset = NAME_PRESETS.find((entry) => entry.id === settings.presetId);

  return (
    <div className="dialog-overlay" role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        className="settings-panel dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Configuración"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <header className="settings-header">
          <h2>Configuración</h2>
          <button type="button" className="apple-button apple-button-ghost" onClick={onClose}>
            Cerrar
          </button>
        </header>

        <section>
          <label className="settings-field">
            Formato del nombre
            <select
              ref={firstFieldRef}
              value={settings.presetId}
              onChange={(event) => {
                patch({ presetId: event.target.value as AppSettings["presetId"] });
              }}
            >
              {NAME_PRESETS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          <p className="settings-hint">{preset?.description}</p>

          {settings.presetId === "custom" ? (
            <>
              <label className="settings-field">
                Plantilla de película
                <input
                  className="inline-edit-input"
                  value={settings.customMovieTemplate}
                  spellCheck={false}
                  onChange={(event) => {
                    patch({ customMovieTemplate: event.target.value });
                  }}
                />
              </label>
              <label className="settings-field">
                Plantilla de episodio
                <input
                  className="inline-edit-input"
                  value={settings.customEpisodeTemplate}
                  spellCheck={false}
                  onChange={(event) => {
                    patch({ customEpisodeTemplate: event.target.value });
                  }}
                />
              </label>
              <p className="settings-hint">
                Tokens disponibles: {ALL_NAME_TOKENS.map((token) => `{${token}}`).join(", ")}
              </p>
            </>
          ) : null}
        </section>

        <section>
          <label className="settings-field">
            Clave de TMDb
            <input
              type="password"
              value={settings.tmdbApiKey}
              placeholder="Sin clave: el título se deduce del nombre del archivo"
              onChange={(event) => {
                setKeyCheck("idle");
                patch({ tmdbApiKey: event.target.value });
              }}
            />
          </label>
          <div className="settings-row">
            <button
              type="button"
              className="apple-button apple-button-secondary"
              onClick={() => void checkKey()}
              disabled={keyCheck === "checking"}
            >
              Comprobar clave
            </button>
            <span className={`key-check key-check-${keyCheck}`}>{KEY_CHECK_MESSAGE[keyCheck]}</span>
          </div>
          <p className="settings-warning">
            La aplicación se ejecuta en el navegador: la clave se guarda en este equipo y viaja en
            las peticiones. No uses una clave compartida.
          </p>
        </section>

        <section>
          <label className="settings-field">
            Longitud objetivo del nombre: {settings.nameTargetLength} caracteres
            <input
              type="range"
              min={60}
              max={255}
              step={5}
              value={settings.nameTargetLength}
              onChange={(event) => {
                patch({ nameTargetLength: Number(event.target.value) });
              }}
            />
          </label>
          <p className="settings-hint">
            Si el nombre se pasa, se descartan por orden: otros idiomas, profundidad de bits, HDR,
            códec, canales y clase comercial. Nunca el título, el año, el episodio ni la resolución.
          </p>
        </section>

        <section>
          <label className="settings-field">
            Análisis simultáneos: {settings.analysisConcurrency}
            <input
              type="range"
              min={1}
              max={8}
              value={settings.analysisConcurrency}
              onChange={(event) => {
                patch({ analysisConcurrency: Number(event.target.value) });
              }}
            />
          </label>
          <p className="settings-hint">
            Más archivos a la vez van más rápido, pero cargan más el equipo.
          </p>
        </section>

        <section className="settings-checks">
          <label>
            <input
              type="checkbox"
              checked={settings.includeSource}
              onChange={(event) => {
                patch({ includeSource: event.target.checked });
              }}
            />
            Escribir la fuente (BluRay, WEB-DL, DVDRip…) aunque sea inferida
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.includeSubtitleLanguages}
              onChange={(event) => {
                patch({ includeSubtitleLanguages: event.target.checked });
              }}
            />
            Incluir los idiomas de los subtítulos
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.includeProviderId}
              onChange={(event) => {
                patch({ includeProviderId: event.target.checked });
              }}
            />
            Incluir el identificador de TMDb (útil para Plex y Jellyfin)
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.autoApplyBand === "medium"}
              onChange={(event) => {
                patch({ autoApplyBand: event.target.checked ? "medium" : "high" });
              }}
            />
            Aceptar coincidencias de confianza media sin marcarlas para revisión
          </label>
        </section>

        <section>
          <button
            type="button"
            className="apple-button apple-button-secondary"
            onClick={() => {
              forgetAllCorrections();
            }}
          >
            Olvidar correcciones aprendidas
          </button>
          <p className="settings-hint">
            Cuando corriges una obra a mano, la aplicación la recuerda para los archivos siguientes.
            Esto borra esa memoria.
          </p>
        </section>
      </div>
    </div>
  );
};
