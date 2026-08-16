/**
 * Forma cruda de las pistas tal y como las devuelve MediaInfo en modo `object`.
 *
 * Se declara en el dominio (y no en el servicio) para que los normalizadores
 * puedan probarse con fixtures sin cargar el WASM. Todos los campos son
 * opcionales porque MediaInfo solo emite los que el contenedor realmente trae.
 */

export interface RawTrackCommon {
  readonly "@type"?: string;
  readonly ID?: string | number;
  readonly StreamOrder?: string | number;
  readonly Format?: string;
  readonly Format_Profile?: string;
  readonly Format_Level?: string | number;
  readonly Format_Commercial?: string;
  readonly Format_Commercial_IfAny?: string;
  readonly Format_AdditionalFeatures?: string;
  readonly Format_Settings_Mode?: string;
  readonly CodecID?: string;
  readonly Language?: string;
  readonly Title?: string;
  readonly Default?: string;
  readonly Forced?: string;
  readonly BitRate?: string | number;
  readonly BitDepth?: string | number;
  readonly Duration?: string | number;
}

export interface RawGeneralTrack extends RawTrackCommon {
  readonly FileSize?: string | number;
  readonly OverallBitRate?: string | number;
  readonly Encoded_Date?: string;
  readonly File_Modified_Date?: string;
  readonly Encoded_Application?: string;
  readonly Encoded_Library?: string;
  readonly Movie?: string;
}

export interface RawVideoTrack extends RawTrackCommon {
  readonly Width?: string | number;
  readonly Height?: string | number;
  readonly Sampled_Width?: string | number;
  readonly Sampled_Height?: string | number;
  readonly DisplayAspectRatio?: string | number;
  readonly FrameRate?: string | number;
  readonly FrameRate_Mode?: string;
  readonly ChromaSubsampling?: string;
  readonly ScanType?: string;
  readonly colour_primaries?: string;
  readonly transfer_characteristics?: string;
  readonly matrix_coefficients?: string;
  readonly HDR_Format?: string;
  readonly HDR_Format_Version?: string;
  readonly HDR_Format_Profile?: string;
  readonly HDR_Format_Level?: string | number;
  readonly HDR_Format_Settings?: string;
  readonly HDR_Format_Compatibility?: string;
  readonly MasteringDisplay_ColorPrimaries?: string;
  readonly MaxCLL?: string;
}

export interface RawAudioTrack extends RawTrackCommon {
  readonly Channels?: string | number;
  readonly ChannelLayout?: string;
  readonly ChannelPositions?: string;
  readonly SamplingRate?: string | number;
}

export interface RawTextTrack extends RawTrackCommon {
  readonly ElementCount?: string | number;
}

export interface RawMediaInfo {
  readonly general?: RawGeneralTrack;
  readonly video: readonly RawVideoTrack[];
  readonly audio: readonly RawAudioTrack[];
  readonly text: readonly RawTextTrack[];
}

export const toNumber = (value: string | number | undefined): number | undefined => {
  if (value === undefined) return undefined;
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const toInteger = (value: string | number | undefined): number | undefined => {
  const parsed = toNumber(value);
  return parsed === undefined ? undefined : Math.round(parsed);
};

export const toText = (value: string | number | undefined): string | undefined => {
  if (value === undefined) return undefined;
  const text = String(value).trim();
  return text.length === 0 ? undefined : text;
};

/** MediaInfo escribe `Yes` / `No` para las banderas del contenedor. */
export const toFlag = (value: string | undefined): boolean | undefined => {
  const text = toText(value)?.toLowerCase();
  if (text === undefined) return undefined;
  if (text === "yes" || text === "true" || text === "1") return true;
  if (text === "no" || text === "false" || text === "0") return false;
  return undefined;
};
