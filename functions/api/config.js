function json(body) {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export function onRequestGet({ env }) {
  return json({
    repairFormUrl: env.REPAIR_FORM_URL || "",
  });
}
