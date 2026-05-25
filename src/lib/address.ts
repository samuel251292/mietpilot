export type ParsedTenantAddress = {
  street: string;
  door: string;
  postalCode: string;
  city: string;
  fullAddress: string;
};

export const viennaDistrictToPostalCode: Record<string, string> = {
  "1": "1010",
  "2": "1020",
  "3": "1030",
  "4": "1040",
  "5": "1050",
  "6": "1060",
  "7": "1070",
  "8": "1080",
  "9": "1090",
  "10": "1100",
  "11": "1110",
  "12": "1120",
  "13": "1130",
  "14": "1140",
  "15": "1150",
  "16": "1160",
  "17": "1170",
  "18": "1180",
  "19": "1190",
  "20": "1200",
  "21": "1210",
  "22": "1220",
  "23": "1230",
};

export function getViennaPostalCodeForDistrict(district: string) {
  return viennaDistrictToPostalCode[String(Number(district))] ?? "";
}

export function parseTenantAddress(address: string): ParsedTenantAddress {
  const normalized = address.trim().replace(/\s+/g, " ");
  const postalMatch = normalized.match(/\b(1\d{3})\s+([A-Za-zÄÖÜäöüß.\-\s]+)$/);
  const districtMatch = normalized.match(/^\s*(\d{1,2})\.\s*,\s*(.+)$/);
  const districtPostalCode = districtMatch ? getViennaPostalCodeForDistrict(districtMatch[1]) : "";
  const withoutPostalCity = postalMatch ? normalized.slice(0, postalMatch.index).replace(/,\s*$/, "") : normalized;
  const withoutDistrict = districtMatch ? districtMatch[2] : withoutPostalCity;
  const doorMatch = withoutDistrict.match(/(?:\/\s*|(?:,\s*)?(?:Tür|Tuer|Top)\s*)([A-Za-z0-9/-]+)\s*$/i);
  const door = doorMatch ? `Tür ${doorMatch[1]}` : "";
  const street = doorMatch ? withoutDistrict.slice(0, doorMatch.index).replace(/[,\s/]+$/, "") : withoutDistrict.replace(/,\s*$/, "");
  const postalCode = postalMatch?.[1] ?? districtPostalCode;
  const city = postalMatch?.[2]?.trim() ?? (districtPostalCode ? "Wien" : "");

  return {
    street,
    door,
    postalCode,
    city,
    fullAddress: normalized,
  };
}
