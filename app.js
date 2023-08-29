const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const app = express();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is Running at 3000");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

const authenticateToken = (request, response, next) => {
  const { tweet } = request.body;
  const { tweetId } = request.params;
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.payload = payload;
        request.tweetId = tweetId;
        request.tweet = tweet;
        next();
      }
    });
  }
};

//API 1
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const checkUser = `SELECT username FROM user WHERE username='${username}';`;
  const dbUser = await db.get(checkUser);
  if (dbUser !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const requestQuery = `INSERT INTO user(name, username, password, gender) VALUES('${name}', '${username}', '${hashedPassword}', '${gender}');`;
      await db.run(requestQuery);
      response.status(200);
      response.send("User created successfully");
    }
  }
});

//API 2
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const checkUser = `SELECT * FROM user WHERE username='${username}';`;
  const dbUserExists = db.get(checkUser);
  if (dbUserExists === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      dbUserExists.password
    );
    if (isPasswordMatched === true) {
      const jwtToken = jwt.sign(dbUserExists, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//API 3
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  let username = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  const getUserId = await db.get(getUserIdQuery);
  const getFollowerIdsQuery = `SELECT following_user_id FROM follower WHERE follower_user_id = ${getUserId.user_id};`;
  const getFollowerId = await db.all(getFollowerIdsQuery);
  const getFollowerIdsSimple = getFollowerId.map((eachUser) => {
    return eachUser.following_user_id;
  });
  const getTweetQuery = `SELECT user.username, tweet.tweet, tweet.date_time as dateTime
    FROM user INNER JOIN tweet ON
    user.user_id = tweet.user_id WHERE user.user_id IN (${getFollowerIdsSimple}) ORDER BY tweet.date_time DESC LIMIT 4;`;
  const responseResult = await db.all(getTweetQuery);
  response.send(responseResult);
});

//API 4
app.get("/user/following/", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const getFollowsQuery = `
        SELECT name
        FROM user INNER JOIN follower ON user.user_id = follower.following_user_id
        WHERE follower.follower_user_id = ${user_id}
    ;`;
  const userFollowsArray = await db.all(getFollowsQuery);
  response.send(userFollowsArray);
});

module.exports = app;
