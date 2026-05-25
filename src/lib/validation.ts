import { z } from "zod";

export const caseBaseSchema = z.object({
  tenantName: z.string().min(2, "Bitte einen Mieternamen angeben."),
  address: z.string().min(5, "Bitte eine Wohnungsadresse angeben."),
  phone: z.string().min(3, "Bitte eine Telefonnummer angeben."),
  moveInDate: z.string().min(1, "Bitte ein Einzugsdatum angeben."),
});

export const calculationSchema = z.object({
  currentGrossRent: z.coerce.number().min(0, "Die aktuelle Miete muss positiv sein."),
  allowedGrossRent: z.coerce.number().min(0, "Die erlaubte Miete muss positiv sein."),
  startDate: z.string().min(1, "Bitte den Startzeitpunkt angeben."),
  endDate: z.string().min(1, "Bitte den Endzeitpunkt angeben."),
  paidDeductions: z.coerce.number().min(0, "Abschlagszahlungen dürfen nicht negativ sein."),
  settlementReductionPercent: z.coerce
    .number()
    .min(0, "Die Reduktion darf nicht negativ sein.")
    .max(100, "Die Reduktion darf maximal 100 % sein."),
});
