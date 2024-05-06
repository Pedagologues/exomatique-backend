import mongoose, { QueryWithHelpers, Types } from "mongoose";
import createConnection from "../../database";
import express from "express";
import {
  idToPseudo,
  tokenToId,
  tokenToPseudo,
  token_middleware,
} from "../accounts/Accounts";
import path from "path";
import fs, { unlinkSync } from "fs";
import { time } from "console";

const raw = fs.readFileSync("./public/default_latex.tex");

const { compileTex } = require("../latex/tex-compiler");
const parser = require("../latex/latex-log-parser");

const exercises_router = express.Router();

const connection = createConnection();

function custom_parser(raw: string): any[] {
  let begin_document_index = raw.indexOf("\\begin{document}");
  if (begin_document_index === -1) return []; //Managed by latex parser

  let header = raw.substring(0, begin_document_index);

  let error: any[] = [];

  let correction_mode = header.indexOf("\\newif\\ifcorrection");

  if (correction_mode === -1) {
    error.push({
      row: header.split("\n").length - 2,
      text: "Missing \\newif\\ifcorrection",
      type: "error",
    });
  }

  let setting_correction = header.indexOf("\\correctiontrue");

  while (setting_correction !== -1) {
    error.push({
      row: header.substring(0, setting_correction).split("\n").length - 1,
      text: "Setting \\ifcorrection manually",
      type: "error",
    });

    setting_correction = header.indexOf(
      "\\correctiontrue",
      setting_correction + "\\correctiontrue".length - 1
    );
  }

  return error;
}

interface IExercise {
  title: string;
  author: string;
  raw: string;
  tags: string[];
}

const Exercise = connection.model(
  "exercises",
  new mongoose.Schema({
    title: {
      type: String,
      required: true,
    },
    author: {
      type: Types.ObjectId,
      required: true,
    },
    raw: {
      type: String,
      required: true,
    },
    tags: {
      type: Array<String>,
      required: false,
    },
    visible: {
      type: Boolean,
      required: true,
    },
    markForRemoval: {
      type: Number,
      required: false,
    },
  })
);

Exercise.ensureIndexes();

export async function edition_middleware(req: any, res: any, next: any) {
  let token = req.params.token || req.body.token;
  let id = req.params.id || req.body.id;

  token_middleware(req, res, async () => {
    let account_id = await tokenToId(token);
    if (account_id == undefined) return;
    let ex = await Exercise.findById(id);
    let author = ex?.author;

    if (author == account_id) {
      next();
    } else {
      res.status(401).send({ message: "You're not the author" });
    }
  });
}

export async function create_empty(author: string): Promise<string> {
  let ex = await Exercise.create({
    title: "Default title",
    author: author,
    raw: raw,
    visible: false,
  });

  return ex._id.toHexString();
}

export async function modify_title(
  id: string,
  title: string
): Promise<boolean> {
  let ex = await Exercise.updateOne({ _id: id }, { $set: { title } });

  return ex.modifiedCount > 0;
}

export async function modify_tags(
  id: string,
  tags: string[]
): Promise<boolean> {
  let ex = await Exercise.updateOne({ _id: id }, { $set: { tags } });

  return ex.modifiedCount > 0;
}

export async function modify_visible(
  id: string,
  visible: boolean
): Promise<boolean> {
  let ex = await Exercise.updateOne({ _id: id }, { $set: { visible } });

  return ex.modifiedCount > 0;
}

function pdf_view_link(id: string): string {
  return "http://localhost:3002/exercises/view/" + id;
}

//Routing
exercises_router.use("/edit", edition_middleware);

exercises_router.post("/view/:id", async (req, res) => {
  let ex_id: string = req.params.id;
  if(ex_id.endsWith("_correction")) ex_id = ex_id.substring(0, ex_id.lastIndexOf("_correction"));

  let id : string = req.params.id;

  console.log(ex_id+" "+id)
  let ex = await Exercise.findById(ex_id);
  if (!ex) {
    return res.sendStatus(404);
  }

  if (!ex?.visible) {
    let token: string = req.body.token;
    let account = String(await tokenToId(token)) || "";

    if (account !== String(ex?.author)) return res.sendStatus(401);
  }

  let pathDir = path.join(__dirname, "..", "..", "..", "compile", ex_id);
  let latex_path = path.join(pathDir, id + ".tex");
  if (!fs.existsSync(latex_path)) {
    // Latex was not buit locally
    if (!fs.existsSync(pathDir)) fs.mkdirSync(pathDir, { recursive: true });
    fs.writeFileSync(latex_path, ex.raw);
    await compileTex(latex_path);
  }
  let pdf_path = path.join(pathDir, id + ".pdf");
  res.sendFile(pdf_path);
});

exercises_router.post("/new", token_middleware, async (req, res) => {
  let token = req.body.token as string;
  let authorId = await tokenToId(token);
  if (authorId === undefined) {
    res
      .status(401)
      .json({ message: "Could not find you in the user database" });
    return;
  }
  let exercise = await create_empty(authorId);
  res.status(200).json({ id: exercise });
});

exercises_router.post("/edit/title/", edition_middleware, async (req, res) => {
  let id = req.body.id;
  let title = req.body.title;
  let b = await modify_title(id, title);
  if (b) res.status(200).send({ message: "Ok" });
  else res.status(401).send({ message: "An error occured" });
});

exercises_router.post("/edit/tags", edition_middleware, async (req, res) => {
  let id = req.body.id;
  let tags = req.body.tags;
  let b = await modify_tags(id, tags);
  if (b) res.status(200).send({ message: "Ok" });
  else res.status(401).send({ message: "An error occured" });
});

exercises_router.post("/edit/visible", edition_middleware, async (req, res) => {
  let id = req.body.id;
  let token = req.body.token;
  let visible = req.body.visible === "true";
  let b = await modify_visible(id, visible);
  if (b) res.status(200).send({ message: "Ok" });
  else res.status(401).send({ message: "An error occured" });
});

exercises_router.post("/edit/remove", edition_middleware, async (req, res) => {
  let id = req.body.id;
  await Exercise.updateOne(
    { _id: id },
    { $set: { markForRemoval: Date.now() } }
  );

  res.status(201).send();
});

exercises_router.post("/edit/restore", edition_middleware, async (req, res) => {
  let id = req.body.id;
  await Exercise.updateOne({ _id: id }, { $unset: { markForRemoval: "" } });

  res.status(201).send();
});

exercises_router.post("/edit/json", edition_middleware, async (req, res) => {
  let id = req.body.id;
  let raw: string = req.body.raw;
  const json = req.body as IExercise;
  json["author"] = (await tokenToId(req.body.token)) || " ";
  await Exercise.updateOne({ _id: id }, { $set: json });
  let pathDir = path.join(__dirname, "..", "..", "..", "compile", id);

  let latex_path = path.join(pathDir, id + ".tex");
  let pdf_path = path.join(pathDir, id + ".pdf");

  if (!fs.existsSync(latex_path.substring(0, latex_path.lastIndexOf("/"))))
    fs.mkdirSync(latex_path.substring(0, latex_path.lastIndexOf("/")));
  fs.writeFileSync(latex_path, raw);
  let log_path = path.join(pathDir, id + ".log");
  let pdf_link = pdf_view_link(id);
  const data: any[] = [];

  if (fs.existsSync(pdf_path)) fs.unlinkSync(pdf_path);

  try {
    compileTex(latex_path)
      .catch((error: any) => {})
      .then((result: any) => {
        const start = async () => {
          const stream = fs.readFileSync(log_path, {
            encoding: "utf8",
          });

          let result = parser
            .latexParser()
            .parse(stream, { ignoreDuplicates: true });

          if (result.errors.length > 0) {
            result.errors.forEach((item: any, index: any) => {
              data.push({
                row: --item.line,
                text: item.message,
                type: item.level,
              });
            });
          }

          let errors = custom_parser(raw);

          if (errors.length > 0) {
            data.push(...errors);
            unlinkSync(pdf_path);
          } else if (result.errors.length == 0) {
            let correction_path = path.join(pathDir, id + "_correction.tex");
            let log_path = path.join(pathDir, id + "_correction.log");
            let correction_raw = raw.replace(
              "\\newif\\ifcorrection",
              "\\newif\\ifcorrection\n\\correctiontrue"
            );
            fs.writeFileSync(correction_path, correction_raw);
            await compileTex(correction_path)
              .catch((error2: any) => {})
              .then((result2: any) => {
                const stream = fs.readFileSync(log_path, {
                  encoding: "utf8",
                });

                let result = parser
                  .latexParser()
                  .parse(stream, { ignoreDuplicates: true });

                if (result.errors.length > 0) {
                  unlinkSync(pdf_path);
                  result.errors.forEach((item: any, index: any) => {
                    data.push({
                      row: item.line - 2,
                      text: item.message,
                      type: item.level,
                    });
                  });
                }
              });
          }
        };

        start().then(function (results) {
          res.setHeader("Content-Type", "application/json");
          res.status(200).json({
            annotations: data,
            link: pdf_link,
          });
        });
      });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      error: err,
    });

    await Exercise.updateOne({ _id: id }, { $set: { visible: false } });
  }
});

exercises_router.get(
  "/:token/:id/edit/raw",
  edition_middleware,
  async (req, res) => {
    let id = req.params.id;
    let ex = await Exercise.findById(id);
    res.status(201).send({ message: ex?.raw });
  }
);

function send_pdf_from_buffer(res: any, pdf_buffer: Buffer) {
  res.setHeader("Content-Length", pdf_buffer.length);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=quote.pdf");
  res.end(pdf_buffer, "binary");
  res.status(200).send();
}

exercises_router.get("/:token/:id/view/", async (req, res) => {
  let token = req.params.token;
  let id = req.params.id;
  let account_id = await tokenToId(token);
  if (account_id == undefined) return;
  let ex = await Exercise.findById(id);
  let author = ex?.author.prototype?.toHexString();
  if (author == account_id || ex?.visible || false) {
    res.sendFile(
      path.join(__dirname, "..", "..", "..", "compile", id, id + ".pdf")
    );
  } else {
    res.status(401).send({ message: "No pdf was found" });
  }
});

exercises_router.get("/:token/:id/json/", async (req, res) => {
  let token = req.params.token;
  let id = req.params.id;
  let ex = await Exercise.findById(id);
  let author = String(ex?.author || "-1");
  let user = ((await tokenToId(token)) || "-2") as string;

  let pathDir = path.join(__dirname, "..", "..", "..", "compile", id);

  let pdfpath = path.join(pathDir, id + ".pdf");

  if (ex?.visible || author === user) {
    let jsonified = ex?.toJSON() as any;
    jsonified.author = await tokenToPseudo(token);
    if (fs.existsSync(pdfpath)) jsonified.link = pdf_view_link(id);
    res.status(200).json(jsonified);
  } else {
    res.status(401).send({ message: "No json was found" });
  }
});

exercises_router.get("/tags", async (req, res) => {
  let tags = (await Exercise.find())
    .filter((v) => {
      return v.tags !== undefined;
    })
    .map((v) => JSON.parse(JSON.stringify(v.tags)) as string[])
    .reduce((v, v1) => v.concat(v1), []);
  res.status(200).send({ message: JSON.stringify({ tags: tags }) });
});

interface IFilter {
  query: string;
  tags: string[];
}

function escapeRegExp(text: string) {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}

exercises_router.post("/request/:begin/:end", async (req, res) => {
  let begin = Number.parseInt(req.body.begin);
  let end = Number.parseInt(req.body.end);
  let viewer: string | undefined = req.body.viewer;
  if (viewer !== undefined) viewer = await tokenToId(viewer);
  end = Math.min(end - begin, 20) + begin;

  let filter = req.body as IFilter;
  let exercises: QueryWithHelpers<Array<any>, any, any, any, "find">;
  let exercises2: QueryWithHelpers<Array<any>, any, any, any, "find">;

  let regexp = new RegExp("" + escapeRegExp(filter.query) + "", "");
  let filter_object: any = { title: { $regex: regexp } };
  if (filter.tags.length > 0) {
    filter_object.tags = { $all: filter.tags };
  }

  if (viewer !== undefined) {
    filter_object.author = viewer;
  } else {
    filter_object.visible = true;
    filter_object.markForRemoval = undefined;
  }

  exercises = Exercise.find(filter_object);
  exercises2 = Exercise.find(filter_object);

  let count = await exercises2.countDocuments();
  exercises = await exercises
    .sort({ _id: 1 })
    .skip(begin)
    .limit(end - begin);

  let exercises_with_details = await Promise.all(
    exercises.map(async (v: any) => {
      return {
        id: v._id,
        title: v.title,
        author: await idToPseudo(v.author as string),
        authorId: v.author,
        link: pdf_view_link(v.id),
        tags: JSON.parse(JSON.stringify(v.tags)) as string[],
        removed: v.markForRemoval !== undefined,
      };
    })
  );

  res.status(200).json({ count: count, exercises: exercises_with_details });
});

export default exercises_router;
