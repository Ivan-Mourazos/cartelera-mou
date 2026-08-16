import { confirmed, unknown, type Traced } from "./provenance";
import { toInteger, toNumber, toText, type RawVideoTrack } from "./raw";
import { classifyResolution } from "./resolution";
import type { DolbyVisionInfo, HdrFormatName, VideoCodecName, VideoTrackInfo } from "./types";

const SOURCE = "VIDEO_STREAM_METADATA" as const;

const CODEC_BY_FORMAT: ReadonlyMap<string, VideoCodecName> = new Map([
  ["hevc", "HEVC"],
  ["h.265", "HEVC"],
  ["h265", "HEVC"],
  ["avc", "AVC"],
  ["h.264", "AVC"],
  ["h264", "AVC"],
  ["av1", "AV1"],
  ["vp9", "VP9"],
  ["vvc", "VVC"],
  ["h.266", "VVC"],
  ["mpeg video", "MPEG-2"],
  ["mpeg-2 video", "MPEG-2"],
  ["mpeg-2", "MPEG-2"],
  ["vc-1", "VC-1"],
  ["mpeg-4 visual", "MPEG-4"],
]);

export const normalizeVideoCodec = (format: string | undefined): VideoCodecName | undefined => {
  const text = toText(format)?.toLowerCase();
  if (text === undefined) return undefined;
  return CODEC_BY_FORMAT.get(text);
};

/**
 * Detección de HDR estrictamente a partir de los metadatos del stream.
 *
 * - Dolby Vision solo si `HDR_Format` lo nombra.
 * - HDR10 solo con metadatos estáticos SMPTE ST 2086 o con compatibilidad HDR10
 *   declarada. La curva PQ por sí sola NO es prueba de HDR10: un Dolby Vision
 *   perfil 5 usa PQ y no lleva capa HDR10.
 * - HDR10+ solo con metadatos dinámicos SMPTE ST 2094 App 4.
 * - HLG solo con la característica de transferencia HLG.
 */
export const detectHdrFormats = (track: RawVideoTrack): readonly HdrFormatName[] => {
  const hdrFormat = toText(track.HDR_Format)?.toLowerCase() ?? "";
  const compatibility = toText(track.HDR_Format_Compatibility)?.toLowerCase() ?? "";
  const transfer = toText(track.transfer_characteristics)?.toLowerCase() ?? "";
  const masteringDisplay = toText(track.MasteringDisplay_ColorPrimaries);

  const formats: HdrFormatName[] = [];

  if (hdrFormat.includes("dolby vision")) formats.push("Dolby Vision");
  if (hdrFormat.includes("smpte st 2094") || compatibility.includes("hdr10+")) {
    formats.push("HDR10+");
  }

  const hasStaticMetadata =
    hdrFormat.includes("smpte st 2086") ||
    hdrFormat.includes("hdr10") ||
    compatibility.includes("hdr10") ||
    masteringDisplay !== undefined;
  if (hasStaticMetadata && !formats.includes("HDR10")) formats.push("HDR10");

  if (transfer.includes("hlg") || hdrFormat.includes("hlg")) formats.push("HLG");

  // HDR10+ implica HDR10 como capa base.
  if (formats.includes("HDR10+") && !formats.includes("HDR10")) formats.push("HDR10");

  return formats;
};

export const detectDolbyVision = (track: RawVideoTrack): DolbyVisionInfo | undefined => {
  const hdrFormat = toText(track.HDR_Format)?.toLowerCase() ?? "";
  if (!hdrFormat.includes("dolby vision")) return undefined;

  // MediaInfo publica el perfil como `dvhe.08.06` o como `dvhe.08` + nivel aparte.
  const rawProfile = toText(track.HDR_Format_Profile);
  const profileMatch =
    rawProfile === undefined ? null : /\.(\d{2})(?:\.(\d{2}))?/u.exec(rawProfile);
  const profileNumber = profileMatch?.[1];
  const levelFromProfile = profileMatch?.[2];
  const level = toText(track.HDR_Format_Level) ?? levelFromProfile;
  const compatibility = toText(track.HDR_Format_Compatibility);

  return {
    ...(profileNumber === undefined ? {} : { profile: String(Number(profileNumber)) }),
    ...(level === undefined ? {} : { level: String(Number(level)) }),
    ...(compatibility === undefined ? {} : { compatibility }),
  };
};

/** Presentación breve para el nombre: `Dolby Vision + HDR10`, `HDR10+`, … */
export const formatHdrForName = (formats: readonly HdrFormatName[]): string | undefined => {
  if (formats.length === 0) return undefined;
  const hasDv = formats.includes("Dolby Vision");
  const hasHdr10Plus = formats.includes("HDR10+");
  const hasHdr10 = formats.includes("HDR10");
  const hasHlg = formats.includes("HLG");

  if (hasDv && hasHdr10Plus) return "Dolby Vision + HDR10+";
  if (hasDv && hasHdr10) return "Dolby Vision + HDR10";
  if (hasDv) return "Dolby Vision";
  if (hasHdr10Plus) return "HDR10+";
  if (hasHdr10) return "HDR10";
  if (hasHlg) return "HLG";
  return undefined;
};

/** Presentación completa para la ficha técnica: `Dolby Vision Profile 8.1`. */
export const formatDolbyVisionDetail = (info: DolbyVisionInfo): string => {
  const profile = info.profile === undefined ? "" : ` Profile ${info.profile}`;
  const level = info.level === undefined ? "" : `.${info.level}`;
  const compatibility =
    info.compatibility === undefined ? "" : ` (compatibilidad ${info.compatibility})`;
  return `Dolby Vision${profile}${profile === "" ? "" : level}${compatibility}`;
};

const tracedText = (value: string | undefined): Traced<string> =>
  value === undefined ? unknown<string>(SOURCE) : confirmed(value, SOURCE);

const tracedNumber = (value: number | undefined): Traced<number> =>
  value === undefined ? unknown<number>(SOURCE) : confirmed(value, SOURCE);

export const normalizeVideoTrack = (track: RawVideoTrack, index: number): VideoTrackInfo => {
  const codec = normalizeVideoCodec(track.Format);
  const width = toInteger(track.Width);
  const height = toInteger(track.Height);
  const classification = classifyResolution(width, height);
  const hdrFormats = detectHdrFormats(track);
  const dolbyVision = detectDolbyVision(track);
  const frameRateMode = toText(track.FrameRate_Mode)?.toUpperCase();

  return {
    index,
    codec:
      codec === undefined
        ? unknown<VideoCodecName>(
            SOURCE,
            `Formato de vídeo no reconocido: ${toText(track.Format) ?? "sin dato"}`,
          )
        : confirmed(codec, SOURCE, `MediaInfo Format = ${toText(track.Format) ?? ""}`),
    commercialCodecName: tracedText(
      toText(track.Format_Commercial_IfAny ?? track.Format_Commercial),
    ),
    codecProfile: tracedText(toText(track.Format_Profile)),
    level: tracedText(toText(track.Format_Level)),
    resolution:
      classification === undefined
        ? unknown(SOURCE, "El stream no declara dimensiones utilizables")
        : confirmed(classification, SOURCE, classification.reason),
    displayAspectRatio: tracedText(toText(track.DisplayAspectRatio)),
    frameRate: tracedNumber(toNumber(track.FrameRate)),
    variableFrameRate:
      frameRateMode === undefined
        ? unknown<boolean>(SOURCE)
        : confirmed(frameRateMode === "VFR", SOURCE, `FrameRate_Mode = ${frameRateMode}`),
    bitrate: tracedNumber(toInteger(track.BitRate)),
    bitDepth: tracedNumber(toInteger(track.BitDepth)),
    chromaSubsampling: tracedText(toText(track.ChromaSubsampling)),
    scanType: tracedText(toText(track.ScanType)),
    colorPrimaries: tracedText(toText(track.colour_primaries)),
    transferCharacteristics: tracedText(toText(track.transfer_characteristics)),
    matrixCoefficients: tracedText(toText(track.matrix_coefficients)),
    hdrFormats:
      hdrFormats.length === 0
        ? confirmed<readonly HdrFormatName[]>(
            [],
            SOURCE,
            "Sin metadatos HDR en el stream: se considera SDR",
          )
        : confirmed<readonly HdrFormatName[]>(
            hdrFormats,
            SOURCE,
            `HDR_Format = ${toText(track.HDR_Format) ?? ""}`,
          ),
    dolbyVision:
      dolbyVision === undefined
        ? unknown<DolbyVisionInfo>(SOURCE, "El stream no declara Dolby Vision")
        : confirmed(dolbyVision, SOURCE, formatDolbyVisionDetail(dolbyVision)),
  };
};

export const isInterlaced = (track: RawVideoTrack): boolean | undefined => {
  const scan = toText(track.ScanType)?.toLowerCase();
  if (scan === undefined) return undefined;
  return scan.includes("interlaced");
};
