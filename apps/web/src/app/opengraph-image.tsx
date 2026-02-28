import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Strale — Agent Capabilities Marketplace";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "hsl(0, 0%, 4%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
        }}
      >
        <div
          style={{
            fontSize: 72,
            fontWeight: 700,
            color: "hsl(0, 0%, 98%)",
            lineHeight: 1.1,
            marginBottom: 24,
          }}
        >
          strale
        </div>
        <div
          style={{
            fontSize: 36,
            color: "hsl(174, 72%, 40%)",
            lineHeight: 1.4,
            marginBottom: 32,
          }}
        >
          Hundreds of capabilities your AI agent can buy at runtime
        </div>
        <div
          style={{
            fontSize: 22,
            color: "hsl(0, 0%, 63%)",
            lineHeight: 1.5,
          }}
        >
          Company data, compliance, finance, logistics — one API, transparent
          pricing, structured JSON.
        </div>
      </div>
    ),
    { ...size }
  );
}
