import path from "node:path";
import { Config } from "@remotion/cli/config";
import { enableTailwind } from "@remotion/tailwind-v4";

const web = path.resolve(process.cwd(), "../web");
const own = (name: string) => path.resolve(process.cwd(), "node_modules", name);

Config.overrideBundlerConfig((config) =>
  enableTailwind({
    ...config,
    resolve: {
      ...config.resolve,
      // The web app's CSS points at its public folder with root-relative URLs.
      roots: [path.join(web, "public")],
      alias: {
        ...(config.resolve?.alias as Record<string, string> | undefined),
        // The room's own avatars, icons and step labels, imported from the web app.
        "@": web,
        // The web app's files would otherwise resolve their own copies, and two
        // Reacts break hooks.
        react: own("react"),
        "react-dom": own("react-dom"),
        "lucide-react": own("lucide-react"),
      },
    },
  }),
);

// PNG frames: JPEG's ringing shows on 1px hairlines and small mono type.
Config.setVideoImageFormat("png");
Config.setColorSpace("bt709");
