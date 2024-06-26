import express, { Express, Request, Response } from "express";
import cors, { CorsOptions } from "cors";
import dotenv from "dotenv";
import Account from "./features/accounts/Accounts";
import Exercise from "./features/exercises/Exercises";

const app: Express = express();

dotenv.config();

app.use(cors());
app.options("*", cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/", express.static("public"));

app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*"); //replace localhost with actual host
  res.header(
    "Access-Control-Allow-Methods",
    "OPTIONS, GET, PUT, PATCH, POST, DELETE"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, X-Requested-With, Authorization, range"
  );
  res.header(
    "Access-Control-Expose-Headers",
    "content-range, content-length, accept-ranges"
  );

  next();
});
const port = process.env.PORT || 3000;

app.get("/ping", (req: Request, res: Response) => {
  res.status(200).send({ message: "Pong" });
});

app.use("/accounts", Account);
app.use("/exercises", Exercise);

var env = process.env.NODE_ENV || "development";
console.log("Running in %s mode", env)
if (env === "development") {
  var fs = require('fs');
  var https = require("https");
  var privateKey  = fs.readFileSync('sslcert/serverkey.pem', 'utf8');
  var certificate = fs.readFileSync('sslcert/server.pem', 'utf8');
  var credentials = {key: privateKey, cert: certificate};
  var httpsServer = https.createServer(credentials, app);
  httpsServer.listen(port);
} else {
  app.listen(port);
}
