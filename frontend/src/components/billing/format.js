export const money = cents => new Intl.NumberFormat("en", { style: "currency", currency: "USD" }).format(cents / 100);
