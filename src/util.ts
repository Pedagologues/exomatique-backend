
import dotenv from "dotenv";
dotenv.config();
const protocol = process.env.PROTOCOL || "http";
const port = process.env.PORT || 3000;
const hostname = process.env.HOSTNAME || "localhost";

export function get_link(...path:string[]){
    let url = protocol+"://"+hostname+":"+port+"/"+path.join("/");
    return url
}