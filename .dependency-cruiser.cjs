module.exports = {
  forbidden: [
    { name: "web-to-mobile", from: { path: "^apps/web" }, to: { path: "^apps/mobile" } },
    { name: "mobile-to-web", from: { path: "^apps/mobile" }, to: { path: "^apps/web" } },
    { name: "core-platform-import", from: { path: "^packages/(core|tokens)" }, to: { path: "^(node_modules/)?(react-dom|react-native|expo-)" } }
  ],
  options: { doNotFollow: { path: "node_modules" }, tsConfig: { fileName: "tsconfig.json" } }
};
