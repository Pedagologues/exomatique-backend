import express, { Express, Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";

import { isUsernameAvailable, register, token, verify } from "./credentials";
const app: Express = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/", express.static(__dirname));

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
    res.status(400).send({ message: "Username already used" });
  } else {
    let isRegistered = await register(username, password);
    if (isRegistered) res.status(201).send({ message: "Account created" });
    else res.status(400).send({ message: "A problem occured" });
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
    let b = verify(token);
    if (token == null || !b)
      res.status(400).send({ message: "Could not login" });
    else
      res.status(201).send({
        message: JSON.stringify({ token: token[0], expiration: token[1] }),
      });
  }

  let token_ = await token(username, password);

  if (token_ == null) res.status(400).send({ message: "Could not login" });
  else
    res.status(201).send({
      message: JSON.stringify({ token: token_[0], expiration: token_[1] }),
    });
});

app.listen(port);
