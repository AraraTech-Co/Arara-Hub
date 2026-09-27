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

      // Ensure source maps are enabled
      webpackConfig.devtool = "source-map";

      return webpackConfig;
    },
  },
  devServer: {
    port: 5002,
    open: true,
    historyApiFallback: true,
    hot: true,
    proxy: {
      "/api": {
        target: "http://localhost:5001",
        changeOrigin: true,
      },
    },
  },
};
