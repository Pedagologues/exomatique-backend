import mongoose from "mongoose";
import createConnection from "./database";
import { hash, compare, sign } from "./crypto";
import { timeStamp } from "console";

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

export async function verify(token: string): Promise<boolean> {
  const v = await Accounts.findOne({ auth_token: token });
  return v != null && (v.auth_expire || 0) <= now();
}

export async function token(
  username: string,
  password: string
): Promise<[string, number] | null> {
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
    return [token, v.auth_expire || 0];
  } else {
    return [v.auth_token, v.auth_expire || 0];
  }
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
