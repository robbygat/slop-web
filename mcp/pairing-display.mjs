import QRCode from "qrcode";

/** The intended user-visible QR is generated locally, never by a third party. */
export async function pairingResult(data) {
  const content = [{ type: "text", text: JSON.stringify(data) }];
  if (data.confirmation_uri == null) return { content };
  const uri = new URL(data.confirmation_uri);
  const fields = new URLSearchParams(uri.hash.slice(1));
  const id = fields.get("id"), code = fields.get("code");
  if (
    uri.origin !== "https://slop.game" || uri.pathname !== "/mcp/pair" ||
    uri.username || uri.password || uri.search ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(id ?? "") ||
    !/^[0-9a-f]{32}$/.test(code ?? "") ||
    [...fields.keys()].sort().join(",") !== "code,id"
  ) throw new Error("Slop returned an invalid pairing link. Try again.");
  const image = await QRCode.toBuffer(data.confirmation_uri, {
    type: "png",
    width: 640,
    margin: 4,
    errorCorrectionLevel: "M",
    color: { dark: "#342D43", light: "#FFFFFF" },
  });
  content.push({
    type: "image",
    mimeType: "image/png",
    data: image.toString("base64"),
  });
  content.push({
    type: "text",
    text:
      "Display this QR on your computer. In Slop on your phone, open Build → Connect an agent → Scan QR. Review the named agent and approve it there. This QR expires after ten minutes; opening or scanning it does not grant access.",
  });
  return { content };
}
