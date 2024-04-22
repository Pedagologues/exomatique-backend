import express, { Express, Request, Response } from "express";
import cors, { CorsOptions } from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import {exec} from "child_process"

import { isUsernameAvailable, register, token, verify } from "./credentials";
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

app.get("/", (req: Request, res: Response) => {
  res.send("Express + TypeScript Server");
});

app.post("/register", async (req, res) => {
  let username = req.body.username as string;
  let password = req.body.password as string;

  let isUsernameAvailable_ = await isUsernameAvailable(username);

  if (!isUsernameAvailable_) {
    res.status(401).send({ message: "Username already used" });
  } else {
    let isRegistered = await register(username, password);
    if (isRegistered) res.status(201).send({ message: "Account created" });
    else res.status(401).send({ message: "A problem occured" });
  }
  console.log(
    "Someone is trying to register a new user : '%s', with password '%s'",
    username,
    password
  );
});

app.post("/login", async (req, res) => {
  let username = req.body.username as string;
  let password = req.body.password as string;

  if (username == undefined || password == undefined) {
    let token = req.body.token as string;
    let b = await verify(token);

    if (token == null || !b)
      res.status(401).send({ message: "Could not login" });
    else
      res.status(201).send({
        message: JSON.stringify({ token: token[0], expiration: token[1] }),
      });
    return;
  }

  let token_ = await token(username, password);

  if (token_ == null) res.status(401).send({ message: "Could not login" });
  else
    res.status(201).send({
      message: JSON.stringify({ token: token_[0], expiration: token_[1] }),
    });
});

app.post("/exercises", async (req, res) => {
  let token = req.body.token as string;
  let id = req.body.id as string;
  let b = await verify(token);
  if (!b) res.status(401).send({ message: "Invalid token" });
  else {
    fs.writeFileSync(path.join(__dirname, "..", "public", 'dummy.tex'), req.body.latex)

    exec('cd public && ls && pdflatex -interaction=nonstopmode dummy.tex', (err, stdout, stderr) => {
      if (err) {
        // node couldn't execute the command
        return;
      }
    
      // the *entire* stdout and stderr (buffered)
      console.log(`stdout: ${stdout}`);
      console.log(`stderr: ${stderr}`);
    });
    

    res.status(201).send({
      message: JSON.stringify({
        link: "http://localhost:3002/exercises?id=" + id,
      }),
    });
  }
});

app.get("/exercises", async (req, res) => {
  let id = Number.parseInt(req.query.id as string);
  res.contentType("application/pdf").sendFile(path.join(__dirname, "..", "public", 'dummy.pdf'));
  console.log("Worked ?")
});

app.listen(port);
