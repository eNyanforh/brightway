import { countryCodes } from "../../pages/profile-countries";
const names = new Intl.DisplayNames(["en"], { type: "region" });
export const countries = countryCodes.map(code => ({ code, name: names.of(code) || code })).sort((a, b) => a.name.localeCompare(b.name));
export const countryName = code => names.of(code) || code;
