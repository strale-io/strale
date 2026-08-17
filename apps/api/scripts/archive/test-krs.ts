const r = await fetch("https://api-krs.ms.gov.pl/api/krs/OdpisPelny/0000001764?rejestr=P&format=json", {
  headers: { Accept: "application/json" },
});
console.log("status:", r.status, "ct:", r.headers.get("content-type"));
const text = await r.text();
console.log("first 300:", text.slice(0, 300));
