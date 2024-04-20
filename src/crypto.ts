import { readFileSync } from "fs";
import { join } from "path";
import { hash as b_hash, compare as b_compare } from "bcrypt";
import jwt from "jsonwebtoken";

const privateKey = readFileSync(
  join(__dirname, "../", "keys", "rsa.key"),
  "utf8"
);
const publicKey = readFileSync(
  join(__dirname, "../", "keys", "rsa.key.pub"),
  "utf8"
);

export function sign(payload: any) {
  try {
    return jwt.sign(payload, privateKey, { algorithm: "RS256" });
  } catch (err) {
    throw err;
  }
}

export function verify(token: string) {
  try {
    return jwt.verify(token, publicKey, { algorithms: ["RS256"] });
  } catch (err) {
    throw err;
  }
}

export function hash(password: string) {
  return b_hash(password, 10);
}

export function compare(password: string, hash: string) {
  return b_compare(password, hash);
}
