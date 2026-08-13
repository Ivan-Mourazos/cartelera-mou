import {
  ArrowRight,
  Check,
  Copy,
  Download,
  Edit2,
  FileCode,
  FileText,
  FolderOpen,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Tag,
  Trash2,
  UploadCloud,
  X,
  Zap,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  SAMPLE_FILENAMES,
  calculateSuggestedName,
  createRenamerItem,
  mergeRealMetadataTags,
} from "../../services/renamer-engine";
import { extractRealMetadata } from "../../services/media-metadata";
import type { RenamerItem } from "../../services/renamer-types";
import {
  copyTextToClipboard,
  downloadTextFile,
  generateBatchScript,
  isMediaFile,
  openDirectoryPicker,
  openFilesPicker,
  renameDirectInDirectory,
  verifyPermission,
} from "../../services/file-system";
import type { PickedFile } from "../../services/file-system";

export function RenamerScreen() {
  const [items, setItems] = useState<RenamerItem[]>([]);
  const [currentDirHandle, setCurrentDirHandle] = useState<FileSystemDirectoryHandle | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingTitleText, setEditingTitleText] = useState("");
  const [addingTagItemId, setAddingTagItemId] = useState<string | null>(null);
  const [customTagInput, setCustomTagInput] = useState("");
  const [notification, setNotification] = useState<string | null>(null);
  const [isRenamingProgress, setIsRenamingProgress] = useState(false);
  const [progressStatus, setProgressStatus] = useState({ current: 0, total: 0, name: "" });

  // Track which item IDs have already been scanned for real metadata
  const scannedIds = useRef(new Set<string>());

  const showNotification = useCallback((message: string) => {
    setNotification(message);
    setTimeout(() => {
      setNotification((prev) => (prev === message ? null : prev));
    }, 3500);
  }, []);

  // ── Real metadata extraction (runs when new items with File objects arrive) ──

  useEffect(() => {
    const pending = items.filter(
      (i) => i.file && i.metadataLoading && !scannedIds.current.has(i.id),
    );
    if (pending.length === 0) return;

    // Mark as being scanned to avoid duplicate work
    for (const item of pending) {
      scannedIds.current.add(item.id);
    }

    const processItems = async () => {
      for (const item of pending) {
        if (!item.file) continue;

        try {
          const realTags = await extractRealMetadata(item.file);
          setItems((prev) =>
            prev.map((it) => {
              if (it.id !== item.id) return it;
              const merged = mergeRealMetadataTags(it.tags, realTags);
              const { suggestedName, warnings } = calculateSuggestedName(
                it.title,
                it.year,
                merged,
                it.extension,
              );
              return {
                ...it,
                tags: merged,
                suggestedName,
                warnings,
                status: warnings.length > 0 ? "error" : "ready",
                metadataLoading: false,
              };
            }),
          );
        } catch {
          setItems((prev) =>
            prev.map((it) => (it.id === item.id ? { ...it, metadataLoading: false } : it)),
          );
        }
      }
    };

    void processItems();
  }, [items]);

  // ── File pickers ──────────────────────────────────────────────────────

  const handleOpenFolder = async () => {
    try {
      const result = await openDirectoryPicker();
      if (!result) return;
      if (result.files.length === 0) {
        showNotification(`No se encontraron archivos multimedia en "${result.folderName}".`);
        return;
      }

      if (result.directoryHandle) {
        setCurrentDirHandle(result.directoryHandle);
      }

      const newItems = result.files.map((f) =>
        createRenamerItem(f.name, f.size, f.handle, f.fileObj),
      );
      setItems(newItems);
      showNotification(
        `Se cargaron ${newItems.length} archivos de "${result.folderName}". Analizando metadatos...`,
      );
    } catch (err) {
      showNotification(`Error al abrir carpeta: ${(err as Error).message}`);
    }
  };

  const handleOpenFiles = async () => {
    try {
      const files = await openFilesPicker();
      if (!files || files.length === 0) return;

      const newItems = files.map((f) => createRenamerItem(f.name, f.size, f.handle, f.fileObj));
      setItems((prev) => [...prev, ...newItems]);
      showNotification(`Se añadieron ${newItems.length} archivos. Analizando metadatos...`);
    } catch (err) {
      showNotification(`Error al seleccionar archivos: ${(err as Error).message}`);
    }
  };

  const handleLoadSamples = () => {
    const samples = SAMPLE_FILENAMES.map((name) =>
      createRenamerItem(name, undefined, undefined, undefined),
    );
    setItems(samples);
    showNotification("Se cargaron 6 archivos de ejemplo.");
  };

  const handlePasteSubmit = () => {
    if (!pasteText.trim()) return;
    const lines = pasteText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) return;

    const newItems = lines.map((line) => createRenamerItem(line, undefined, undefined, undefined));
    setItems((prev) => [...prev, ...newItems]);
    setPasteText("");
    setShowPasteBox(false);
    showNotification(`Se añadieron ${newItems.length} nombres.`);
  };

  // ── Drag and Drop ─────────────────────────────────────────────────────

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const dtItems = Array.from(e.dataTransfer.items);
    const collected: PickedFile[] = [];

    for (const dtItem of dtItems) {
      if (dtItem.kind !== "file") continue;

      let handle: FileSystemFileHandle | undefined;
      if ("getAsFileSystemHandle" in dtItem) {
        try {
          const h = await (
            dtItem as unknown as { getAsFileSystemHandle: () => Promise<FileSystemHandle> }
          ).getAsFileSystemHandle();
          if (h.kind === "file") {
            handle = h as FileSystemFileHandle;
          }
        } catch {
          // Fallback
        }
      }

      const file = dtItem.getAsFile();
      if (file && isMediaFile(file.name)) {
        collected.push({ name: file.name, size: file.size, handle, fileObj: file });
      }
    }

    if (collected.length > 0) {
      const newItems = collected.map((f) => createRenamerItem(f.name, f.size, f.handle, f.fileObj));
      setItems((prev) => [...prev, ...newItems]);
      showNotification(
        `Se añadieron ${newItems.length} archivos multimedia. Analizando metadatos...`,
      );
    } else if (e.dataTransfer.files.length > 0) {
      showNotification("No se encontraron archivos multimedia compatibles.");
    }
  };

  // ── Tag toggling ──────────────────────────────────────────────────────

  const handleToggleTag = (itemId: string, tagId: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const nextTags = item.tags.map((tag) =>
          tag.id === tagId ? { ...tag, active: !tag.active } : tag,
        );
        const { suggestedName, warnings } = calculateSuggestedName(
          item.title,
          item.year,
          nextTags,
          item.extension,
        );
        return {
          ...item,
          tags: nextTags,
          suggestedName,
          warnings,
          status: "customized",
        };
      }),
    );
  };

  const handleAddCustomTag = (itemId: string) => {
    if (!customTagInput.trim()) {
      setAddingTagItemId(null);
      return;
    }

    const cleanLabel = customTagInput.trim().replaceAll("[", "").replaceAll("]", "");
    if (!cleanLabel) return;

    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const newTag = {
          id: `custom-${Date.now()}`,
          label: cleanLabel,
          kind: "custom",
          active: true,
        };
        const nextTags = [...item.tags, newTag];
        const { suggestedName, warnings } = calculateSuggestedName(
          item.title,
          item.year,
          nextTags,
          item.extension,
        );
        return {
          ...item,
          tags: nextTags,
          suggestedName,
          warnings,
          status: "customized",
        };
      }),
    );

    setCustomTagInput("");
    setAddingTagItemId(null);
  };

  // ── Inline Title Editing ──────────────────────────────────────────────

  const startEditTitle = (item: RenamerItem) => {
    setEditingItemId(item.id);
    setEditingTitleText(item.title);
  };

  const saveEditTitle = (itemId: string) => {
    if (!editingTitleText.trim()) {
      setEditingItemId(null);
      return;
    }
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const nextTitle = editingTitleText.trim();
        const { suggestedName, warnings } = calculateSuggestedName(
          nextTitle,
          item.year,
          item.tags,
          item.extension,
        );
        return {
          ...item,
          title: nextTitle,
          suggestedName,
          warnings,
          status: "customized",
        };
      }),
    );
    setEditingItemId(null);
  };

  // ── Copy / Download / Rename ──────────────────────────────────────────

  const handleCopySingle = async (name: string) => {
    const ok = await copyTextToClipboard(name);
    if (ok) showNotification(`Copiado: "${name}"`);
  };

  const handleCopyAll = async () => {
    const selected = items.filter((i) => i.selected);
    const text = selected.map((i) => i.suggestedName).join("\n");
    const ok = await copyTextToClipboard(text);
    if (ok) showNotification(`Se copiaron ${selected.length} nombres.`);
  };

  const handleDownloadScript = (format: "bat" | "ps1" | "sh") => {
    const script = generateBatchScript(items, format);
    const filename = `renombrar_archivos.${format}`;
    downloadTextFile(filename, script);
    showNotification(`Script "${filename}" descargado.`);
  };

  const handleDirectRename = async () => {
    const itemsToRename = items.filter((i) => i.selected && i.originalName !== i.suggestedName);

    if (itemsToRename.length === 0) {
      showNotification("No hay archivos seleccionados con cambios pendientes.");
      return;
    }

    let itemsWithHandles = itemsToRename.filter((i) => i.fileHandle !== undefined);

    // If handles are missing, ask for the folder and immediately proceed
    if (itemsWithHandles.length === 0) {
      try {
        const result = await openDirectoryPicker();
        if (!result) return;

        if (result.directoryHandle) {
          setCurrentDirHandle(result.directoryHandle);
        }

        const dirFilesByName = new Map(result.files.map((f) => [f.name, f]));

        const updatedItems = items.map((item) => {
          const dirFile = dirFilesByName.get(item.originalName);
          if (dirFile?.handle && item.selected) {
            return { ...item, fileHandle: dirFile.handle };
          }
          return item;
        });

        setItems(updatedItems);

        itemsWithHandles = updatedItems.filter(
          (i) => i.selected && i.originalName !== i.suggestedName && i.fileHandle !== undefined,
        );

        if (itemsWithHandles.length === 0) {
          showNotification(
            "No se encontraron coincidencias en la carpeta. Usa el Script .bat para renombrar.",
          );
          return;
        }
      } catch (err) {
        showNotification(`Error: ${(err as Error).message}`);
        return;
      }
    }

    // Verify permission on directory handle if present
    if (currentDirHandle) {
      await verifyPermission(currentDirHandle, true);
    }

    // Direct in-place rename execution
    setIsRenamingProgress(true);
    setProgressStatus({ current: 0, total: itemsWithHandles.length, name: "" });

    const result = await renameDirectInDirectory(itemsWithHandles, (current, total, name) => {
      setProgressStatus({ current, total, name });
    });

    setIsRenamingProgress(false);

    if (result.succeeded > 0) {
      const renamedOriginals = new Set(itemsWithHandles.map((i) => i.originalName));
      setItems((prev) =>
        prev.map((item) => {
          if (renamedOriginals.has(item.originalName)) {
            return {
              ...item,
              originalName: item.suggestedName,
              status: "renamed",
              renamedSuccess: true,
            };
          }
          return item;
        }),
      );
      showNotification(`¡Éxito! Se renombraron ${result.succeeded} archivo(s) en disco.`);
    }

    if (result.failed > 0) {
      showNotification(
        `Atención: ${result.failed} archivo(s) no pudieron renombrarse directamente. Usa el Script .bat.`,
      );
    }
  };

  // ── Selection ─────────────────────────────────────────────────────────

  const handleToggleSelect = (itemId: string) => {
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, selected: !i.selected } : i)));
  };

  const handleToggleSelectAll = () => {
    const allSelected = items.every((i) => i.selected);
    setItems((prev) => prev.map((i) => ({ ...i, selected: !allSelected })));
  };

  const handleRemoveItem = (itemId: string) => {
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  };

  const handleClearAll = () => {
    setItems([]);
    setCurrentDirHandle(null);
    scannedIds.current.clear();
    showNotification("Lista vaciada.");
  };

  // ── Filtered items ────────────────────────────────────────────────────

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const query = searchQuery.toLowerCase();
    return items.filter(
      (item) =>
        item.originalName.toLowerCase().includes(query) ||
        item.suggestedName.toLowerCase().includes(query) ||
        item.title.toLowerCase().includes(query),
    );
  }, [items, searchQuery]);

  const selectedCount = items.filter((i) => i.selected).length;
  const hasDirectoryHandles = items.some((i) => i.fileHandle !== undefined);
  const loadingCount = items.filter((i) => i.metadataLoading).length;

  return (
    <div className="app-main">
      {/* Paste Box Card */}
      {showPasteBox && (
        <div className="paste-box-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 600, fontSize: "14px" }}>
              Pegar nombres de archivos o títulos de Drive
            </span>
            <button type="button" className="icon-button" onClick={() => setShowPasteBox(false)}>
              <X size={16} />
            </button>
          </div>
          <textarea
            className="paste-textarea"
            placeholder="Pega aquí uno o varios nombres de archivo (un nombre por línea)...&#10;Ejemplo: Oppenheimer.2023.IMAX.2160p.UHD.BluRay.x265.TrueHD.Atmos.mkv"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
          />
          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <button
              type="button"
              className="apple-button apple-button-secondary"
              onClick={() => setShowPasteBox(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="apple-button apple-button-primary"
              onClick={handlePasteSubmit}
            >
              <Sparkles size={15} />
              Detectar Metadatos y Sugerir
            </button>
          </div>
        </div>
      )}

      {/* Empty State / Dropzone */}
      {items.length === 0 ? (
        <div
          className={`dropzone-container ${isDragOver ? "is-dragover" : ""}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={(e) => void handleDrop(e)}
          onClick={handleOpenFolder}
        >
          <div className="dropzone-icon">
            <UploadCloud size={28} />
          </div>
          <div className="dropzone-title">Selecciona o arrastra tus archivos aquí</div>
          <div className="dropzone-subtitle">
            Lee los metadatos reales del archivo (resolución, códecs, HDR, pistas de audio e
            idiomas) para generar un nombre limpio en Title Case.
          </div>
          <div className="dropzone-actions" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="apple-button apple-button-primary"
              onClick={handleOpenFolder}
            >
              <FolderOpen size={16} />
              Abrir Carpeta Local (Renombrado directo)
            </button>
            <button
              type="button"
              className="apple-button apple-button-secondary"
              onClick={handleOpenFiles}
            >
              <FileText size={16} />
              Seleccionar Archivos
            </button>
            <button
              type="button"
              className="apple-button apple-button-ghost"
              onClick={() => setShowPasteBox(true)}
            >
              <Edit2 size={16} />
              Pegar Nombres / Drive
            </button>
            <button
              type="button"
              className="apple-button apple-button-ghost"
              onClick={handleLoadSamples}
            >
              <Sparkles size={16} />
              Cargar Ejemplos
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* List Toolbar */}
          <div className="list-header">
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <button
                type="button"
                className="apple-button apple-button-ghost"
                style={{ padding: "4px 8px", fontSize: "12px" }}
                onClick={handleToggleSelectAll}
              >
                {items.every((i) => i.selected) ? "Deseleccionar todo" : "Seleccionar todo"}
              </button>
              <span className="list-count">
                {selectedCount} de {items.length} archivos
              </span>
              {loadingCount > 0 && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    fontSize: "12px",
                    color: "var(--apple-blue)",
                  }}
                >
                  <Loader2 size={12} className="spin" />
                  Analizando metadatos ({loadingCount})...
                </span>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div className="search-input-wrapper">
                <Search size={14} className="search-icon" />
                <input
                  type="text"
                  className="search-input"
                  placeholder="Buscar en la lista..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <button
                type="button"
                className="apple-button apple-button-secondary"
                onClick={handleOpenFolder}
                title="Abrir otra carpeta"
              >
                <FolderOpen size={15} />
                Carpeta
              </button>

              <button
                type="button"
                className="apple-button apple-button-secondary"
                onClick={handleOpenFiles}
                title="Añadir más archivos"
              >
                <Plus size={15} />
                Archivos
              </button>

              <button
                type="button"
                className="apple-button apple-button-ghost"
                onClick={() => setShowPasteBox(true)}
                title="Pegar nombres de Drive"
              >
                <Edit2 size={15} />
                Pegar
              </button>

              <button
                type="button"
                className="apple-button apple-button-ghost"
                onClick={handleClearAll}
                title="Vaciar lista"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>

          {/* Drag & drop zone over the file list */}
          <div
            className={`file-list ${isDragOver ? "is-dragover" : ""}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={(e) => void handleDrop(e)}
          >
            {filteredItems.map((item) => (
              <div key={item.id} className={`file-card ${item.renamedSuccess ? "renamed" : ""}`}>
                <div className="file-card-main">
                  <div className="file-card-names">
                    <input
                      type="checkbox"
                      className="file-checkbox"
                      checked={item.selected}
                      onChange={() => handleToggleSelect(item.id)}
                    />

                    <div className="name-comparison">
                      <div className="original-name" title={item.originalName}>
                        {item.originalName}
                      </div>

                      {editingItemId === item.id ? (
                        <div style={{ display: "flex", gap: "6px", marginTop: "2px" }}>
                          <input
                            type="text"
                            className="inline-edit-input"
                            value={editingTitleText}
                            onChange={(e) => setEditingTitleText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveEditTitle(item.id);
                              if (e.key === "Escape") setEditingItemId(null);
                            }}
                            autoFocus
                          />
                          <button
                            type="button"
                            className="apple-button apple-button-primary"
                            style={{ padding: "4px 10px" }}
                            onClick={() => saveEditTitle(item.id)}
                          >
                            Guardar
                          </button>
                        </div>
                      ) : (
                        <div className="suggested-name-row">
                          <ArrowRight size={14} className="suggest-arrow" />
                          <span
                            className="suggested-name"
                            title={item.suggestedName}
                            onClick={() => startEditTitle(item)}
                          >
                            {item.suggestedName}
                          </span>
                          {item.metadataLoading && (
                            <Loader2
                              size={12}
                              className="spin"
                              style={{ color: "var(--apple-blue)" }}
                            />
                          )}
                          {item.renamedSuccess && (
                            <span className="status-pill success">
                              <Check size={12} /> Renombrado
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="file-card-actions">
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => handleCopySingle(item.suggestedName)}
                      title="Copiar nombre sugerido"
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => startEditTitle(item)}
                      title="Editar título manualmente"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => handleRemoveItem(item.id)}
                      title="Quitar de la lista"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>

                {/* Interactive Metadata Tags Row */}
                <div className="tags-row">
                  <span className="tags-label">
                    <Tag
                      size={11}
                      style={{
                        display: "inline",
                        verticalAlign: "middle",
                        marginRight: "3px",
                      }}
                    />
                    {item.metadataLoading ? "Leyendo metadatos..." : "Metadatos:"}
                  </span>

                  {item.tags.map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      className={`tag-chip ${tag.active ? "active" : ""} kind-${tag.kind}`}
                      onClick={() => handleToggleTag(item.id, tag.id)}
                      title={`Haz clic para ${tag.active ? "quitar" : "añadir"} [${tag.label}]`}
                    >
                      {tag.active && <Check size={10} />}
                      {tag.label}
                    </button>
                  ))}

                  {/* Add custom tag */}
                  {addingTagItemId === item.id ? (
                    <div style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      <input
                        type="text"
                        className="inline-edit-input"
                        style={{ padding: "2px 6px", fontSize: "11px", width: "90px" }}
                        placeholder="ej: Director's Cut"
                        value={customTagInput}
                        onChange={(e) => setCustomTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleAddCustomTag(item.id);
                          if (e.key === "Escape") setAddingTagItemId(null);
                        }}
                        autoFocus
                      />
                      <button
                        type="button"
                        className="apple-button apple-button-primary"
                        style={{ padding: "2px 6px", fontSize: "11px" }}
                        onClick={() => handleAddCustomTag(item.id)}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        style={{ width: "20px", height: "20px" }}
                        onClick={() => setAddingTagItemId(null)}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="tag-chip"
                      style={{ borderStyle: "dashed" }}
                      onClick={() => setAddingTagItemId(item.id)}
                      title="Añadir un tag personalizado a este archivo"
                    >
                      <Plus size={10} /> Añadir tag
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Floating Action Dock */}
          {selectedCount > 0 && (
            <div className="floating-dock">
              <button
                type="button"
                className="apple-button apple-button-primary"
                onClick={handleDirectRename}
                title="Renombrar archivos directamente en disco"
              >
                <Zap size={15} />
                {hasDirectoryHandles
                  ? `Renombrar ${selectedCount} en Disco`
                  : `Renombrar ${selectedCount} Archivos`}
              </button>

              <button
                type="button"
                className="apple-button apple-button-secondary"
                onClick={() => handleDownloadScript("bat")}
                title="Descargar script .bat para renombrar en Windows"
              >
                <Download size={14} />
                Script .bat
              </button>

              <button
                type="button"
                className="apple-button apple-button-secondary"
                onClick={handleCopyAll}
              >
                <Copy size={14} />
                Copiar Nombres
              </button>

              <div style={{ display: "flex", gap: "4px" }}>
                <button
                  type="button"
                  className="apple-button apple-button-ghost"
                  onClick={() => handleDownloadScript("ps1")}
                  title="Descargar script de PowerShell (.ps1)"
                >
                  <FileCode size={14} /> .ps1
                </button>
                <button
                  type="button"
                  className="apple-button apple-button-ghost"
                  onClick={() => handleDownloadScript("sh")}
                  title="Descargar script de Bash (.sh para macOS/Linux)"
                >
                  <FileCode size={14} /> .sh
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Direct Renaming Progress Modal */}
      {isRenamingProgress && (
        <div className="modal-overlay">
          <div className="modal-dialog" style={{ maxWidth: "420px", textAlign: "center" }}>
            <h3 style={{ fontSize: "16px", fontWeight: 600 }}>Renombrando en disco...</h3>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
              {progressStatus.current} de {progressStatus.total}: {progressStatus.name}
            </p>
            <div
              style={{
                width: "100%",
                height: "6px",
                backgroundColor: "var(--apple-surface)",
                borderRadius: "var(--radius-full)",
                overflow: "hidden",
                marginTop: "8px",
              }}
            >
              <div
                style={{
                  height: "100%",
                  backgroundColor: "var(--apple-blue)",
                  width: `${(progressStatus.current / Math.max(1, progressStatus.total)) * 100}%`,
                  transition: "width 150ms ease",
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Notification Toast */}
      {notification && (
        <div
          style={{
            position: "fixed",
            bottom: "84px",
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "var(--apple-surface)",
            color: "var(--text-primary)",
            padding: "8px 16px",
            borderRadius: "var(--radius-full)",
            boxShadow: "var(--shadow-md)",
            border: "1px solid var(--border-strong)",
            fontSize: "13px",
            fontWeight: 500,
            zIndex: 60,
            display: "flex",
            alignItems: "center",
            gap: "8px",
            animation: "fadeIn 150ms ease",
          }}
        >
          <Sparkles size={14} color="var(--apple-blue)" />
          {notification}
        </div>
      )}
    </div>
  );
}
