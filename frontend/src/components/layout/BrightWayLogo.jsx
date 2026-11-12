// This asset was retained from the official BrightWay site in public/images/reference.
export default function BrightWayLogo({ className = "", width = 42, height = 42 }) {
  return <img
    className={className}
    src={`${import.meta.env.BASE_URL}images/reference/brightway-logo.png`}
    width={width}
    height={height}
    alt=""
    aria-hidden="true"
    decoding="async"
  />;
}
