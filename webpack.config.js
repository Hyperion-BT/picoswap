module.exports = {
  mode: "development",
  entry: "./src/index.ts",
  output: {
    path: __dirname + "/dist/"
  },
  module: {
    rules: [
      {
        test: /(?<!\.d)\.(ts|tsx)$/,
        exclude: /node_modules/,
        resolve: {
          extensions: [".ts", ".tsx"],
        },
        use: [
          "ts-loader",
          // helios-loader AFTER ts-loader so it is able to 
          //  import Helios scripts BEFORE ts-loader is called
          "@hyperionbt/helios-loader"
        ]
      },
      {
        test: /\.(hl|helios)$/,
        exclude: /node_modules/,
        use: [
          {
            loader: "@hyperionbt/helios-loader",
            options: {
              // must be true when importing Helios scripts in Typescript
              emitTypes: true
            }
          }
        ]
      }
    ]
  }
}
