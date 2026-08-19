import { Clapperboard } from "lucide-react";

import { RenamerScreen } from "../features/renamer/RenamerScreen";

/**
 * Cáscara de la aplicación. La cabecera solo lleva la marca y las acciones
 * globales; todo lo demás lo pone la pantalla.
 */
export function App() {
  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden>
              <Clapperboard size={12} />
            </span>
            <span className="brand-name">Renombrador</span>
          </div>
        </div>
      </header>

      <RenamerScreen />
    </div>
  );
}
