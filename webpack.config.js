
const path = require('path');
const webpack = require('webpack');

module.exports = {
  entry: path.resolve(__dirname, './src/index.js'),
  module: {
    rules: [
    
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: ['babel-loader'],},
      {
        test: /\.css$/i,
        use: ["style-loader", "css-loader"],
      },
    
    
    ],
  },
  resolve: {
    extensions: ['*', '.js', '.jsx'],
  },
  output: {
    path: path.resolve(__dirname, './dist'),
    filename: 'bundle.js',
    publicPath: '/'
  },
  experiments: {
    syncWebAssembly: true,
  },
  plugins: [new webpack.HotModuleReplacementPlugin(), 
],
  devServer: {
    contentBase: path.resolve(__dirname, './dist'),
    hot: true,
    historyApiFallback: true,
    publicPath: '/', 
    host: '0.0.0.0',
      disableHostCheck: true,
    
  },
};
