import counties from "./liberia-counties.json" with { type: "json" };

// Source: Liberia Ministry of Local Government, "MIA – Then, Now and Onwards".
// https://mlg.gov.lr/index.php/general/mia-then-now-and-onwards
// Reviewed 2026-10-18. Other countries intentionally have no region requirement in this MVP.
export const liberiaCounties = Object.freeze([...counties]);
const countyKey = (value) => typeof value === "string"
  ? value.trim().toLowerCase().replace(/\s+county$/, "").replace(/\s+/g, "")
  : "";
const countyByKey = new Map(liberiaCounties.map((name) => [countyKey(name), name]));

export function requiresCounty(countryCode) {
  return typeof countryCode === "string" && countryCode.trim().toUpperCase() === "LR";
}

// Accept familiar legacy spelling/case without rewriting saved profile values on reads.
export function canonicalLiberiaCounty(value) {
  return countyByKey.get(countyKey(value)) ?? null;
}
