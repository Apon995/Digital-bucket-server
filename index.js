const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const cors = require("cors");
const bodyperser = require("body-parser");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const app = express();
require("dotenv").config();
const port = process.env.PORT || 5000;

// ---middlewears----

const uri = `mongodb+srv://${process.env.DB_OWER}:${process.env.DB_PASS}@digitalbucket.ozg7d0r.mongodb.net/?retryWrites=true&w=majority`;
app.use(
  cors({
    // http://localhost:5173
    origin: "http://localhost:5173",
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true,
  })
);
app.use(express.json());
app.use(bodyperser.json());
app.use(cookieParser());

const verifytoken = (req, res, next) => {
  const token = req?.cookies?.Token;
  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }

  jwt.verify(token, process.env.ACCESS_TOKEN, (error, decoded) => {
    if (error) {
      return res.status(401).send({ message: "unauthorized access" });
    }
    req.user = decoded;
    next();
  });
};

const isValidObjectId = (id) => {
  return ObjectId.isValid(id);
};

// ----Mongodbatlas-server-----
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const Tododb = client.db("DigitalBucket").collection("TodoCollection");

    // ---jwtToken--apis---

    app.post("/jwt", async (req, res) => {
      const user = req.body;

      const token = jwt.sign(user, process.env.ACCESS_TOKEN, {
        expiresIn: "24h",
      });

      res.cookie("Token", token, {
        httpOnly: true,
        secure: false,
      });
      res.send({ success: true });
    });

    app.post("/jwtTokClear", async (req, res) => {
      res
        .clearCookie("Token", { maxAge: 0 })
        .send({ "Token clear": "successfull" });
    });

    // ----Create-new-board---
    app.post("/createBoard", async (req, res) => {
      const obj = req.body;

      const insertobj = {
        _id: new ObjectId(),
        user: obj.user,
        BoardName: obj.BoardName,
        Columns: [
          {
            id: 1,
            columnName: obj.firstColumn,
            Task: [],
          },
          {
            id: 2,
            columnName: obj.secondColumn,
            Task: [],
          },
          {
            id: 3,
            columnName: obj.thirdColumn,
            Task: [],
          },
        ],
      };

      const result = await Tododb.insertOne(insertobj);
      res.send(result);
    });

    // -----Add-new--Task---
    app.post("/TaskInsert", async (req, res) => {
      const Id = req?.query?.ID;
      if (!isValidObjectId(Id)) {
        return res.status(400).send({ message: "Invalid ObjectId" });
      }

      const BoardName = req?.query?.BoardName;
      const status = req?.query?.status;
      const obj = req?.body;
      const find = {
        _id: new ObjectId(Id),
        BoardName: BoardName,
        "Columns.columnName": status,
      };

      const updateDoc = {
        $push: { "Columns.$.Task": { _id: new ObjectId(), ...obj } },
      };

      const result = await Tododb.updateOne(find, updateDoc);

      res.send(result);
    });

    // ----get-the-current-user-boards--
    app.get("/searchTodo", verifytoken, async (req, res) => {
      const email = req?.query?.email;

      if (email !== req?.user?.email) {
        return res.status(403).send({ message: "Forbideen access" });
      }
      const find = { user: email };
      const result = await Tododb.find(find).toArray();

      res.send(result);
    });

    // -----Find-single-Task-board---
    app.get("/Todo", async (req, res) => {
      const Id = req?.query?.ID;
      if (!isValidObjectId(Id)) {
        return res.status(400).send({ message: "Invalid ObjectId" });
      }
      const find = { _id: new ObjectId(Id) };
      const result = await Tododb.findOne(find);

      res.send(result);
    });

    app.get("/FindTask", async (req, res) => {
      const Id = req.query.Id;
      if (!isValidObjectId(Id)) {
        return res.status(400).send({ message: "Invalid ObjectId" });
      }
      const columnName = req.query.columnName;
      const currentTitle = req.query.currentTitle;

      const result = await Tododb.aggregate([
        {
          $match: {
            _id: new ObjectId(Id),
            "Columns.columnName": columnName,
            "Columns.Task.title": currentTitle,
          },
        },
        {
          $project: {
            _id: 0,
            task: {
              $filter: {
                input: "$Columns",
                as: "column",
                cond: {
                  $eq: ["$$column.columnName", columnName],
                },
              },
            },
          },
        },
      ]).toArray();

      const taskArray = result?.[0]?.task?.[0]?.Task || [];

      const foundTask = taskArray.find((task) => task.title === currentTitle);

      res.json(foundTask);
    });

    // ----Delete-Board---
    app.delete("/DeleteBoard", async (req, res) => {
      const Id = req?.query?.ID;
      if (!isValidObjectId(Id)) {
        return res.status(400).send({ message: "Invalid ObjectId" });
      }
      const find = { _id: new ObjectId(Id) };
      const result = await Tododb.deleteOne(find);

      res.send(result);
    });

    // -----Delete--Task--
    app.delete("/DeleteTask", async (req, res) => {
      const ID = req.query.ID;
      const TaskId = req.query.TaskId;
      const columnId = parseInt(req?.query?.columnId);

      const result = await Tododb.updateOne(
        {
          _id: new ObjectId(ID),
          "Columns.id": columnId,
        },
        {
          $pull: {
            "Columns.$.Task": {
              _id: new ObjectId(TaskId),
            },
          },
        }
      );

      res.send(result);
    });

    //  ----Edit-Board---
    app.put("/UpdateBoard", async (req, res) => {
      const Id = req?.query?.ID;
      if (!isValidObjectId(Id)) {
        return res.status(400).send({ message: "Invalid ObjectId" });
      }
      const find = { _id: new ObjectId(Id) };
      const { BoardName, Columns } = req?.body;

      let updateObj = {};

      updateObj["$set"] = { BoardName: BoardName };

      Columns?.forEach((element) => {
        if (element.columnName) {
          updateObj["$set"] = updateObj["$set"] || {};
          updateObj["$set"][`Columns.${element.id - 1}.columnName`] =
            element.columnName;
        }
      });
      const result = await Tododb.updateOne(find, updateObj);
      res.send(result);
    });

    //  -----Edit-Task---code--
    app.put("/UpdateTask", async (req, res) => {
      const Id = req?.query?.ID;
      if (!isValidObjectId(Id)) {
        return res.status(400).send({ message: "Invalid ObjectId" });
      }
      const currentTitle = req?.query?.title;
      const columnId = parseInt(req?.query?.columnId);
      const TaskId = req?.query?.TaskId;
      const { title, description, status } = req?.body;

      if (currentTitle != title) {
        const result = await Tododb.updateOne(
          {
            _id: new ObjectId(Id),
            Columns: {
              $elemMatch: {
                id: columnId,
                Task: {
                  $elemMatch: {
                    _id: new ObjectId(TaskId),
                  },
                },
              },
            },
          },
          {
            $set: {
              "Columns.$[col].Task.$[task].title": title,
              "Columns.$[col].Task.$[task].description": description,
              "Columns.$[col].Task.$[task].status": status,
            },
          },
          {
            arrayFilters: [
              { "col.id": columnId },
              { "task._id": new ObjectId(TaskId) },
            ],
          }
        );
        res.send(result);
      }
    });

    // ----Edit-Task-status----
    app.put("/Updatestatus", async (req, res) => {
      const Id = req?.query?.ID;
      if (!isValidObjectId(Id)) {
        return res.status(400).send({ message: "Invalid ObjectId" });
      }
      const columnId = parseInt(req?.query?.columnId);
      const TaskId = req?.query?.TaskId;
      const currentStatus = req?.query?.currentStatus;
      const obj = req?.body;

      if (obj.status !== currentStatus) {
        await Tododb.updateOne(
          {
            _id: new ObjectId(Id),
            Columns: {
              $elemMatch: {
                id: columnId,
              },
            },
          },
          {
            $pull: {
              "Columns.$.Task": {
                _id: new ObjectId(TaskId),
              },
            },
          }
        );
        const insert = await Tododb.updateOne(
          {
            _id: new ObjectId(Id),
            "Columns.columnName": obj.status,
          },
          {
            $push: { "Columns.$.Task": { _id: new ObjectId(), ...obj } },
          }
        );

        res.send(insert);
      }
    });

    app.put("/DropDown", async (req, res) => {
      const boardId = req?.query?.ID;
      if (!isValidObjectId(boardId)) {
        return res.status(400).send({ message: "Invalid ObjectId" });
      }

      const { draggableId, source, destination } = req.body;

      const [sourceColumnIdstring, sourceColumnName] =
        source.droppableId.split("-");
      const [destinationColumnIdstring, destinationColumnName] =
        destination.droppableId.split("-");

      const sourceColumnId = parseInt(sourceColumnIdstring);
      const destinationColumnId = parseInt(destinationColumnIdstring);

      if (sourceColumnId === destinationColumnId) {
        const sourceColumnResult = await Tododb.findOne({
          _id: new ObjectId(boardId),
          "Columns.id": sourceColumnId,
          "Columns.Task._id": new ObjectId(draggableId),
        });

        const currentTask = sourceColumnResult?.Columns?.find(
          (col) => col.id === sourceColumnId
        )?.Task?.find((task) => task._id.toString() === draggableId);

        if (currentTask) {
          const newTask = {
            _id: new ObjectId(),
            title: currentTask?.title || "",
            description: currentTask?.description || "",
            status: sourceColumnName || "",
          };
          await Tododb.updateOne(
            {
              _id: new ObjectId(boardId),
              "Columns.id": sourceColumnId,
            },
            {
              $push: {
                "Columns.$.Task": {
                  $each: [newTask],
                  $position: destination.index,
                },
              },
            }
          );

          const resultPull = await Tododb.updateOne(
            {
              _id: new ObjectId(boardId),
              "Columns.id": sourceColumnId,
            },
            {
              $pull: {
                "Columns.$.Task": {
                  _id: new ObjectId(draggableId),
                },
              },
            }
          );

          res.send(resultPull);
        }
      } else {
        // If the task was moved to a different column
        const sourceColumnResult = await Tododb.findOne({
          _id: new ObjectId(boardId),
          "Columns.id": sourceColumnId,
          "Columns.Task._id": new ObjectId(draggableId),
        });

        const currentTask = sourceColumnResult?.Columns?.find(
          (col) => col.id === sourceColumnId
        )?.Task?.find((task) => task._id.toString() === draggableId);

        if (currentTask) {
          const newTask = {
            _id: new ObjectId(),
            title: currentTask?.title || "",
            description: currentTask?.description || "",
            status: destinationColumnName || "",
          };
          const datainsert = await Tododb.updateOne(
            {
              _id: new ObjectId(boardId),
              "Columns.id": destinationColumnId,
            },
            {
              $push: {
                "Columns.$.Task": {
                  $each: [newTask],
                  $position: destination.index,
                },
              },
            }
          );

          if (datainsert.modifiedCount == 1) {
            const result = await Tododb.updateOne(
              {
                _id: new ObjectId(boardId),
                "Columns.id": sourceColumnId,
              },
              {
                $pull: {
                  "Columns.$.Task": {
                    _id: new ObjectId(draggableId),
                  },
                },
              }
            );
            res.send(result);
          }
        } else {
          return;
        }
      }
    });

    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } catch (error) {
    console.log(error);
  }
}
run();

// ----server-running--test-code--
app.get("/", (req, res) => {
  res.send("DigitalBucket server is running Now ! ");
});

app.listen(port, () => {
  console.log(`DigitaBucket server is running on port ${port}`);
});
