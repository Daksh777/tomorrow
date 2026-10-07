import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

/** App icon: the day curve with its band on the dark brand colour. Also used as the favicon. */
export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#14181f" }}>
        <svg width="512" height="512" viewBox="0 0 512 512">
          <path d="M70 380 C150 360 190 250 260 240 S380 150 442 300 L442 400 C380 300 330 340 260 330 S150 430 70 440 Z" fill="#e8a33d" fillOpacity="0.45" />
          <path d="M70 410 C150 395 190 290 260 285 S380 210 442 350" fill="none" stroke="#f6f4ef" strokeWidth="26" strokeLinecap="round" />
        </svg>
      </div>
    ),
    size,
  );
}
