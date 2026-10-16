import "./index.css";
import { Composition, Still } from "remotion";
import { DURATION } from "./script";
import { FPS, HEIGHT, WIDTH } from "./time";
import { Tour } from "./Tour";

export function Root() {
  return (
    <>
      <Composition
        id="tour"
        component={Tour}
        durationInFrames={DURATION}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{ measure: false, poster: false }}
      />
      <Still id="poster" component={Tour} width={WIDTH} height={HEIGHT} defaultProps={{ measure: false, poster: true }} />
    </>
  );
}
