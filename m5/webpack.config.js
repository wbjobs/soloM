const path = require('path');

module.exports = {
  entry: './src/renderer/index.tsx',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'renderer.js',
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.jsx'],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'babel-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  plugins: [
    new (require('html-webpack-plugin'))({
      template: './src/renderer/index.html',
    }),
  ],
  devServer: {
    port: 3000,
    hot: true,
  },
};
