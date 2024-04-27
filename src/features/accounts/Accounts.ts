import mongoose from "mongoose";
import createConnection from "../../database";
import { hash, compare, sign } from "../../crypto";
import express, { RequestHandler } from "express";

const accounts_router = express.Router();

const connection = createConnection();
const expiration = 7 * 24 * 3600;

const Accounts = connection.model(
  "accounts",
  new mongoose.Schema({
    username: {
      type: String,
      required: true,
    },
    password: {
      type: String,
      required: true,
    },
    auth_token: {
      type: String,
      required: false,
    },
    auth_expire: {
      type: Number,
      required: false,
    },
  })
);

Accounts.ensureIndexes();

function now() {
  return Math.floor(Date.now() / 1000);
}

export async function verify(token: string): Promise<[string, string, number] | undefined> {
  const valide_token = await Accounts.findOne({ auth_token: token });
  if(valide_token != null && (valide_token.auth_expire || 0) > now()){
    return [token, valide_token._id.toHexString(), valide_token.auth_expire || 0];
  }
  return undefined;
}

export async function token(
  username: string,
  password: string
): Promise<[string, string, number] | null> {
  const v = await Accounts.findOne({ username: username });
  if (v == null || !(await compare(password, v.password))) return null;
  if (v.auth_token == undefined || (v?.auth_expire || 0) <= now()) {
    let token = sign({ username, creation: now() });
    let u = await Accounts.updateOne(
      { _id: v._id },
      {
        $set: {
          auth_token: token,
          auth_expire: now() + expiration,
        },
      }
    );
    return [token, v._id.toHexString(), v.auth_expire || 0];
  } else {
    return [v.auth_token, v._id.toHexString(), v.auth_expire || 0];
  }
}

export async function tokenToId(token: string): Promise<string | undefined> {
  const v = await Accounts.findOne({ auth_token: token });
  return v?._id.toHexString();
}

export async function tokenToPseudo(
  token: string
): Promise<string | undefined> {
  const v = await Accounts.findOne({ auth_token: token });
  return v?.username;
}

export async function idToPseudo(id: string): Promise<string | undefined> {
  const v = await Accounts.findOne({ _id: id });
  return v?.username;
}

export async function register(
  username: string,
  password: string
): Promise<boolean> {
  const b = await Accounts.exists({ username: username });
  let exist = b != null;
  if (!exist)
    await Accounts.create({
      username: username,
      password: await hash(password),
    });
  return exist;
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  const b = await Accounts.exists({ username: username });
  return b == null;
}

// Routing

accounts_router.post("/register", async (req, res) => {
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

accounts_router.post("/login", async (req, res) => {
  let username = req.body.username as string;
  let password = req.body.password as string;

  if (username == undefined || password == undefined) {
    let token = req.body.token as string;
    let accountId = await tokenToId(token);
    let data = await verify(token);

    if (token == null || !data)
      res.status(400).send({ message: "Could not login" });
    else {
      res.status(201).json({ token: data[0], id:data[1], expiration: data[1] });
    }
    return;
  }

  let token_ = await token(username, password);

  if (token_ == null) res.status(400).send({ message: "Could not login" });
  else
    res
      .status(201)
      .json({ token: token_[0], id: token_[1], expiration: token_[2] });
});

export async function token_middleware(req: any, res: any, next: any) {
  let token = req.params.token || req.body.token;
  if (!(await verify(token))) {
    res.status(401).send({ message: "Invalid token" });
    return;
  }
  next();
}
export default accounts_router;
