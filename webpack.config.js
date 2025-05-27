// webpack.config.js - Fixed build configuration to match manifest
const path = require("path");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");

module.exports = (env, argv) => {
  const isProduction = argv.mode === "production";

  return {
    entry: {
      background: "./src/background.ts",
      // Fix: Change content.ts to youtube.js to match manifest
      youtube: "./src/content.ts",
      popup: "./src/popup.ts",
    },
    output: {
      path: path.resolve(__dirname, "dist"),
      filename: "[name].js",
      clean: true,
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: "ts-loader",
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: [MiniCssExtractPlugin.loader, "css-loader"],
        },
      ],
    },
    resolve: {
      extensions: [".tsx", ".ts", ".js"],
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
    plugins: [
      new MiniCssExtractPlugin({
        filename: "styles.css",
      }),
      new HtmlWebpackPlugin({
        template: "./src/popup.html",
        filename: "popup.html",
        chunks: ["popup"],
        minify: isProduction,
      }),
      new CopyWebpackPlugin({
        patterns: [
          {
            // Fix: Use the manifest from src folder
            from: "./src/manifest.json",
            to: "manifest.json",
          },
          {
            from: "./src/icons",
            to: "icons",
            noErrorOnMissing: true,
          },
        ],
      }),
    ],
    devtool: isProduction ? false : "cheap-module-source-map",
    optimization: {
      minimize: isProduction,
      splitChunks: {
        chunks: "all",
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: "vendors",
            chunks: "all",
          },
          common: {
            name: "common",
            minChunks: 2,
            chunks: "all",
            enforce: true,
          },
        },
      },
    },
    performance: {
      hints: isProduction ? "warning" : false,
      maxAssetSize: 250000,
      maxEntrypointSize: 250000,
    },
  };
};
