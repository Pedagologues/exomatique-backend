import path from "path";
import fs from "fs";
import { exec as exec_, ExecException, execSync } from "child_process";
import promisify from "util.promisify";

interface IExec {
  error : ExecException | null,
  stdout : string,
  stderr : string
}

const exec = (id:string) : Promise<IExec>=> {
  return new Promise(
    (resolve, reject) => {
      try {
        exec_(id, (error, stdout, stderr) => {
          if(error === null) resolve({error, stdout, stderr})
          else reject({error, stdout, stderr})
        })
      } catch (error) {
        reject({error});
      }
      
    }
  );
}

function getDir(id: string) {
  return path.join(__dirname.split("src/")[0], "compile", id);
}

export default async function latex(id: string, code: string): Promise<string> {
  let file_path = path.join(getDir(id), id + ".tex");
  let pdf_file_path = path.join(getDir(id), id + ".pdf");
  if(!fs.existsSync(file_path.substring(0, file_path.lastIndexOf('/'))))
    fs.mkdirSync(file_path.substring(0, file_path.lastIndexOf('/')))
  fs.writeFileSync(file_path, code);

  {
    let { stdout: stdout_, stderr: stderr_ } = await exec("pwd").catch(e=>console.error(e)) as IExec;
    console.log("'" + stdout_ + "'");
  }
  let error;
  let o = await exec(
    "cd compile/"+id+" && ls && pdflatex -interaction=nonstopmode " + id + ".tex"
  ).catch(e_ => error = e_) as IExec;
  console.log(JSON.stringify(o.stdout))

  return pdf_file_path.split("bibinfo-back")[1];
}
