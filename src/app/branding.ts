import { z } from "zod";

import rawBranding from "../../branding.json";

const brandingSchema = z.object({
  productName: z.string().min(1),
  shortName: z.string().min(1),
  tagline: z.string().min(1),
  description: z.string().min(1),
  supportEmail: z.string(),
});

export const branding = brandingSchema.parse(rawBranding);
