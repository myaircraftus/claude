import React from "react";

const SWOOSH_PATH =
  "M1347.6341535085,67.2469258229c-256.2458986331-33.4050834091-493.3407042665-38.0921567171-750.6051826964-11.6205435721-104.0947274571,10.7109826141-205.8089817755,25.4343546719-308.0009633499,46.4920083633-83.4994439702,17.2058741543-162.7998513343,40.3439894844-246.6992954833,63.8615630414,22.7126116657-10.1169864527,47.5487703698-16.9089894003,72.6645067029-24.8572893231l96.1022736095-30.4131913069c106.9207250789-33.8368734096,216.9936281431-55.5278817035,328.3297767826-73.4642169914C748.4211118341,3.5758723225,959.5441668397-8.1964248414,1170.8011759015,5.7515615684c74.9116905823,4.945953021,146.8222322222,13.1499105676,220.3592522219,26.0443590989,88.7972705048,15.5702778579,173.3484931535,39.5586752175,257.7620982536,70.420003368l129.2082603325,52.0286621515-37.5491872016-10.4978131924c-65.122196547-18.2065366783-129.428811054-33.1901207196-196.5797613958-44.2264912248l-196.3676846036-32.2733559467Z";

const VB_W = 1836.419921875;
const VB_H_FULL = 535.1139302309;
const VB_H_SHORT = 370; // crops out the "Search any aircraft record" subtitle

interface MyAircraftLogoProps {
  /** "light" = white fill (use on dark/navy backgrounds)
   *  "dark"  = #0A1628 fill (use on white/light backgrounds)
   *  "blue"  = #2563EB fill */
  variant?: "light" | "dark" | "blue";
  /** Rendered height in px; width is computed automatically */
  height?: number;
  /** Whether to include the "Search any aircraft record" subtitle */
  showSubtitle?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function MyAircraftLogo({
  variant = "light",
  height = 28,
  showSubtitle = false,
  className = "",
  style = {},
}: MyAircraftLogoProps) {
  const color =
    variant === "light" ? "#FFFFFF" : variant === "blue" ? "#2563EB" : "#0A1628";
  const vbH = showSubtitle ? VB_H_FULL : VB_H_SHORT;
  const width = height * (VB_W / vbH);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${VB_W} ${vbH}`}
      height={height}
      width={width}
      className={className}
      style={{ fill: color, display: "block", flexShrink: 0, ...style }}
    >
      <path d={SWOOSH_PATH} />
      <text
        style={{
          fontSize: "292.3881530762px",
          fontFamily: "Arial-BoldItalicMT, Arial",
          fontStyle: "italic",
          fontWeight: 700,
        }}
        transform="translate(0 343.0514302309)"
      >
        <tspan x="0" y="0">myaircraft.us</tspan>
      </text>
      {showSubtitle && (
        <text
          style={{
            fontSize: "83.7049636841px",
            fontFamily: "Arial-BoldItalicMT, Arial",
            fontStyle: "italic",
            fontWeight: 700,
            letterSpacing: ".1000013034em",
          }}
          transform="translate(292.0947265625 503.6022114809)"
        >
          <tspan x="0" y="0">Search any aircraft record</tspan>
        </text>
      )}
    </svg>
  );
}
