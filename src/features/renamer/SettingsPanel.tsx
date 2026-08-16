import { NAME_PRESETS } from "../../domain/naming/presets";
import type { AppSettings } from "../../services/settings";

export interface SettingsPanelProps {
  readonly settings: AppSettings;
  readonly onChange: (settings: AppSettings) => void;
  readonly onClose: () => void;
}

export const SettingsPanel = ({ settings, onChange, onClose }: SettingsPanelProps) => {
  const patch = (partial: Partial<AppSettings>): void => onChange({ ...settings, ...partial });

  return (
    <aside className="settings-panel" aria-label="Configuración">
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
            value={settings.presetId}
            onChange={(event) => patch({ presetId: event.target.value as AppSettings["presetId"] })}
          >
            {NAME_PRESETS.filter((preset) => preset.id !== "custom").map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>
        <p className="settings-hint">
          {NAME_PRESETS.find((preset) => preset.id === settings.presetId)?.description}
        </p>
      </section>

      <section>
        <label className="settings-field">
          Clave de TMDb (opcional)
          <input
            type="password"
            value={settings.tmdbApiKey}
            placeholder="Sin clave: el título se deduce del nombre del archivo"
            onChange={(event) => patch({ tmdbApiKey: event.target.value })}
          />
        </label>
        <p className="settings-hint">
          Con clave se usa el título oficial español (es-ES / región ES). Sin clave la aplicación
          funciona igual, pero el título y el año salen del nombre original.
        </p>
        <p className="settings-warning">
          La aplicación se ejecuta en el navegador: la clave se guarda en este equipo. No uses una
          clave compartida.
        </p>
      </section>
    </aside>
  );
};
