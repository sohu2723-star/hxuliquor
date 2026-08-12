const ALLOWED_ACTIONS = new Set([
  "getProducts",
  "getProductByBarcode",
  "searchProducts",
  "getCategories",
  "getSales",
  "googleLogin",
  "getEmployees",
  "addEmployee",
  "deleteEmployee",
  "createSale",
  "addProduct",
  "updateProduct",
  "deleteProduct",
]);

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response
      .status(405)
      .json({ success: false, message: "Method not allowed" });
  }

  const action = Array.isArray(request.query?.action)
    ? request.query.action[0]
    : request.query?.action;

  if (!action || !ALLOWED_ACTIONS.has(action)) {
    return response
      .status(400)
      .json({ success: false, message: "Invalid action" });
  }

  const gasUrl = process.env.GAS_URL || process.env.VITE_GAS_URL;
  if (!gasUrl) {
    return response
      .status(500)
      .json({ success: false, message: "GAS_URL is not configured" });
  }

  try {
    const upstreamUrl = new URL(gasUrl);
    upstreamUrl.searchParams.set("action", action);

    const body =
      typeof request.body === "string"
        ? request.body
        : JSON.stringify(request.body ?? {});
    const upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body,
      redirect: "follow",
    });
    const text = await upstream.text();

    if (!upstream.ok) {
      let upstreamMessage;
      try {
        upstreamMessage = JSON.parse(text)?.message;
      } catch {
        // Google commonly returns an HTML sign-in/error page for a deployment
        // whose access or execution identity is configured incorrectly.
      }
      return response.status(502).json({
        success: false,
        message:
          upstreamMessage ||
          `Apps Script returned HTTP ${upstream.status}. Check the web app deployment access and authorization.`,
      });
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return response.status(502).json({
        success: false,
        message:
          "Apps Script returned a non-JSON response. Check that GAS_URL is the deployed /exec URL and the web app access is set to Anyone.",
      });
    }

    response.setHeader("Cache-Control", "no-store");
    return response.status(200).json(data);
  } catch (error) {
    console.error("Apps Script proxy request failed", error);
    return response
      .status(502)
      .json({ success: false, message: "Unable to reach Apps Script" });
  }
}
