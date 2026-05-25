import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

export function formatPercent(value: number) {
  return new Intl.NumberFormat("de-AT", {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(value / 100);
}
