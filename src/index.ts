import express, { Express, Request, Response } from "express";
import cors, { CorsOptions } from "cors";
import dotenv from "dotenv";
import Account from "./features/accounts/Accounts"
import Exercise from "./features/exercises/Exercises"

const app: Express = express();

var whitelist = ['http://localhost:3000']
var corsOptions : CorsOptions = {
  origin: function (origin, callback) {
    if (whitelist.indexOf(origin as string) !== -1 || !origin) {
      callback(null, true)
      console.log(origin+" "+true)
    } else {
      console.log(origin+" "+false)
      callback(new Error('Not allowed by CORS'))
    }
  }
}


app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/", express.static("public"));
app.options('*', cors())

app.use(function(req, res, next) {
  res.header('Access-Control-Allow-Origin', 'http://localhost:3000'); //replace localhost with actual host
  res.header('Access-Control-Allow-Methods', 'OPTIONS, GET, PUT, PATCH, POST, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With, Authorization, range');
  res.header('Access-Control-Expose-Headers', "content-range, content-length, accept-ranges")

  next();
});
dotenv.config();
const port = process.env.PORT || 3000;

app.get("/ping", (req: Request, res: Response) => {
  res.status(200).send({message:"Pong"})
});

app.use('/accounts', Account)
app.use('/exercises', Exercise)

app.listen(port);
