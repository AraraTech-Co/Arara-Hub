const path = require("path");

module.exports = {
  webpack: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
    configure: (webpackConfig) => {
      webpackConfig.resolve.fallback = {
        ...webpackConfig.resolve.fallback,
        path: require.resolve("path-browserify"),
      };

      webpackConfig.module.rules.push({
        test: /\.json$/,
        type: "json",
      });

      webpackConfig.devtool = "source-map";

      return webpackConfig;
    },
    devServer: {
      port: 3000,
      open: true,
      historyApiFallback: true,
      hot: true,
      proxy: {
        "/api": {
          target: "http://localhost:8080",
          changeOrigin: true,
        },
      },
    },
  },
};
