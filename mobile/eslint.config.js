// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", "src/components/ui/*", "src/components/ui/**/*"],
  },
  {
    rules: {
      // react-native Animated is built on reading Animated.Value refs during render
      // (interpolate() in style objects) — the React Compiler ref rule is incompatible
      // with this canonical RN API.
      "react-hooks/refs": "off",
      // Animated.timing() calls inside effects are not setState; the rule also flags
      // functional setState updaters in event handlers. False positives for this app.
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);