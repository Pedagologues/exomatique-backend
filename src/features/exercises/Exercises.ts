import mongoose, { Types } from "mongoose";
import createConnection from "../../database";
import latex from "../latex/LatexCompiler";
import express from "express";
import {
  idToPseudo,
  tokenToId,
  tokenToPseudo,
  token_middleware,
} from "../accounts/Accounts";
import path from "path";

const exercises_router = express.Router();

const connection = createConnection();

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
    raw: "% Hi !",
    visible: false,
  });

  return ex._id.toHexString();
}

export async function modify_raw(
  id: string,
  code: string
): Promise<string | null> {
  let ex = await Exercise.updateOne({ _id: id }, { $set: { raw: code } });
  if (ex.matchedCount == 0) return null;

  return latex(id, code);
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

//Routing
exercises_router.use(express.static("compile"));

exercises_router.use("/edit", edition_middleware);

exercises_router.post("/:token/new", token_middleware, async (req, res) => {
  let token = req.params.token as string;
  let authorId = await tokenToId(token);
  if (authorId === undefined) {
    res
      .status(401)
      .send({ message: "Could not find you in the user database" });
    return;
  }
  let exercise = await create_empty(authorId);
  res.status(200).send({ message: JSON.stringify({ id: exercise }) });
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

exercises_router.post("edit/visible", edition_middleware, async (req, res) => {
  let id = req.body.id;
  let token = req.body.token;
  let visible = req.body.visible === "true";
  let b = await modify_visible(id, visible);
  if (b) res.status(200).send({ message: "Ok" });
  else res.status(401).send({ message: "An error occured" });
});

exercises_router.post("/edit/raw", async (req, res) => {
  let id = req.body.id;
  let raw = req.body.raw;
  console.log(id + " " + raw);
  let url = await modify_raw(id, raw);
  res.status(200).send({
    message: JSON.stringify({
      link: "http://localhost:3002/exercises" + url?.split("/compile")[1],
    }),
  });
});

exercises_router.post("/edit/json", edition_middleware, async (req, res) => {
  let id = req.body.id;
  let raw = req.body.raw;
  const json = req.body as IExercise;
  json["author"] = (await tokenToId(req.body.token)) || " ";
  console.log(json);
  await Exercise.updateOne({ _id: id }, { $set: json });
  let url = await modify_raw(id, raw);
  res.status(200).send({
    message: JSON.stringify({
      link: "http://localhost:3002/exercises" + url?.split("/compile")[1],
    }),
  });
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
    console.log(
      path.join(__dirname, "..", "..", "..", "compile", id, id + ".pdf")
    );
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
  console.log(ex);
  let author = ex?.author;
  if (ex?.visible || author === (await tokenToId(token))) {
    let jsonified = ex?.toJSON() as any;
    jsonified.author = await tokenToPseudo(token);
    res.status(200).send({ message: JSON.stringify(jsonified) });
  } else {
    res.status(401).send({ message: "No json was found" });
  }
});

exercises_router.get("/tags", async (req, res) => {
  console.log("TAGS");
  let tags = (await Exercise.find())
    .filter((v) => {
      return v.tags !== undefined;
    })
    .map((v) => JSON.parse(JSON.stringify(v.tags)) as string[])
    .reduce((v, v1) => v.concat(v1), []);
  console.log({ message: JSON.stringify({ tags: tags }) });
  res.status(200).send({ message: JSON.stringify({ tags: tags }) });
});

exercises_router.get("/request/:size/:begin", async (req, res) => {
  let size = Math.min(Number.parseInt(req.params.size) || 20, 20);
  let begin = req.params.begin === "0" ? undefined : req.params.begin;

  let exercises = await Exercise.find(begin ? { _id: { $gt: begin }, visible: true} : {visible: true})
  .sort({ _id: 1 })
  .limit(size).select({_id:1, title:1, author: 1, tags: 1});


  let exercises_with_details = await Promise.all(exercises.map(async v=>{
    return {
      id: v._id,
      author : await idToPseudo(v.author as string),
      link: "http://localhost:3002/exercises/"+v.id+"/"+v.id+".pdf", 
      tags: JSON.parse(JSON.stringify(v.tags)) as string[]
    }
  }))
  console.log(exercises_with_details)
  
  res.status(200).json(exercises_with_details);
});

export default exercises_router;
