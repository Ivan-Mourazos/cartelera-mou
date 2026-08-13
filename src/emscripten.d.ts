// Type stubs for mediainfo.js Emscripten types
declare type EmscriptenModule = Record<string, unknown>;

declare type EmscriptenModuleFactory<T = EmscriptenModule> = (
  moduleOverrides?: Partial<T>,
) => Promise<T>;
