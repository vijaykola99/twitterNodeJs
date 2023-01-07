const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const path = require("path");
const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializationDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log(`Server Running at http:localhost:3000`);
    });
  } catch (error) {
    console.log(`Error:${error.message}`);
    process.exit(1);
  }
};

initializationDBAndServer();

const convertDBToUserTweetObj = (obj) => {
  return {
    username: obj.username,
    tweet: obj.tweet,
    dateTime: obj.date_time,
  };
};

const convertDBToUserNameObj = (obj) => {
  return {
    name: obj.username,
  };
};

const convertDBToTweetObj = (obj) => {
  return {
    tweet: obj.tweet,
    likes: obj.likes,
    replies: obj.replies,
    dateTime: obj.date_time,
  };
};

const convertDBToLikeUsernames = (obj) => {
  obj1 = { likes: [] };
  for (let i of obj) {
    obj1.likes.push(i.username);
  }
  return obj1;
};

const convertDBToReplyUsernames = (obj) => {
  obj1 = { replies: [] };
  for (let i of obj) {
    obj1.replies.push(i);
  }
  return obj1;
};

const authenticationToken = (request, response, next) => {
  const authHead = request.headers["authorization"];
  if (authHead !== undefined) {
    const token = authHead.split(" ")[1];
    jwt.verify(token, "secrete", (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }
};

//User Register
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const checkingUserQuery = `
SELECT *
FROM user
WHERE username = "${username}";
`;
  const userCheck = await db.get(checkingUserQuery);
  if (userCheck === undefined) {
    if (password.length >= 6) {
      const hashedPassword = await bcrypt.hash(password, 10);
      const addUserQuery = `
INSERT INTO user(username, password, name, gender)
VALUES ("${username}", "${hashedPassword}", "${name}", "${gender}");
`;
      const dbResponse = await db.run(addUserQuery);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//User Login
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const checkingUserQuery = `
SELECT *
FROM user
WHERE username = "${username}"
`;
  const userCheck = await db.get(checkingUserQuery);
  if (userCheck !== undefined) {
    const passwordCheck = await bcrypt.compare(password, userCheck.password);
    if (passwordCheck === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "secrete");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});

//Get Feeds
app.get(
  "/user/tweets/feed/",
  authenticationToken,
  async (request, response) => {
    const { username } = request;
    const getTweetsQuery = `
SELECT username, tweet.tweet, tweet.date_time
FROM user NATURAL JOIN tweet
WHERE user.user_id IN (SELECT follower.following_user_id FROM user INNER JOIN follower ON user.user_id = follower.follower_user_id
WHERE username = "${username}")
ORDER BY date_time DESC
LIMIT 4
;
`;
    const tweetFeeds = await db.all(getTweetsQuery);
    response.send(
      tweetFeeds.map((eachTweet) => convertDBToUserTweetObj(eachTweet))
    );
  }
);

//Get User Following
app.get("/user/following/", authenticationToken, async (request, response) => {
  const { username } = request;
  const getUserFollowingQuery = `
SELECT (username) AS name
FROM user INNER JOIN follower ON user.user_id = follower.follower_user_id
WHERE follower.follower_user_id IN (SELECT follower.following_user_id
FROM user INNER JOIN follower ON user.user_id = follower.follower_user_id
WHERE user.username = "${username}")
GROUP BY follower.follower_user_id;

`;
  const userFollowingList = await db.all(getUserFollowingQuery);
  response.send(userFollowingList);
});

//Get User Followers
app.get("/user/followers/", authenticationToken, async (request, response) => {
  const { username } = request;
  const getUserFollowersQuery = `
SELECT (username) AS name
FROM user INNER JOIN follower ON user.user_id = follower.follower_user_id
WHERE follower.follower_user_id IN (SELECT follower.follower_user_id
FROM user INNER JOIN follower ON user.user_id = follower.following_user_id
WHERE user.username = "${username}")
GROUP BY follower.follower_user_id;

`;
  const userFollowersList = await db.all(getUserFollowersQuery);
  response.send(userFollowersList);
});

//Get User Follow Tweet
app.get("/tweets/:tweetId/", authenticationToken, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const getTweetQuery = `
SELECT
tweet.tweet,
(SELECT COUNT(like.user_id)
FROM tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id
WHERE tweet.tweet_id = ${tweetId}) AS likes,
(SELECT COUNT(reply.user_id)
FROM tweet INNER JOIN reply ON tweet.tweet_id = reply.tweet_id
WHERE tweet.tweet_id = ${tweetId}) AS replies,
tweet.date_time
FROM tweet INNER JOIN follower ON tweet.user_id = follower.follower_user_id
WHERE follower.follower_user_id IN (SELECT (follower.following_user_id)
FROM follower INNER JOIN user ON follower.follower_user_id = user.user_id
WHERE username = "${username}")
AND tweet.tweet_id = ${tweetId};

`;
  const tweet = await db.get(getTweetQuery);
  if (tweet !== undefined) {
    response.send(convertDBToTweetObj(tweet));
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});
module.exports = app;

//Get Liked users

app.get(
  "/tweets/:tweetId/likes/",

  authenticationToken,

  async (request, response) => {
    const { tweetId } = request.params;

    const { username } = request;

    const checkUserFollowingUsersTweetQuery = `

SELECT

DISTINCT (tweet.user_id)

FROM tweet INNER JOIN follower ON tweet.user_id = follower.follower_user_id

WHERE follower.follower_user_id IN (SELECT (follower.following_user_id)

FROM follower INNER JOIN user ON follower.follower_user_id = user.user_id

WHERE username = "${username}")

AND tweet.tweet_id = ${tweetId};



`;

    const checkUserFollowingUsersTweet = await db.get(
      checkUserFollowingUsersTweetQuery
    );

    if (checkUserFollowingUsersTweet !== undefined) {
      const likedUsersTweetQuery = `

SELECT user.username

FROM user INNER JOIN like ON user.user_id = like.user_id

WHERE like.tweet_id = ${tweetId};

`;

      const likedUsers = await db.all(likedUsersTweetQuery);

      response.send(convertDBToLikeUsernames(likedUsers));
    } else {
      response.status(401);

      response.send("Invalid Request");
    }
  }
);

//Get Reply Users

app.get(
  "/tweets/:tweetId/replies/",

  authenticationToken,

  async (request, response) => {
    const { username } = request;

    const { tweetId } = request.params;

    const checkUserFollowingUsersTweetQuery = `

SELECT

DISTINCT (tweet.user_id)

FROM tweet INNER JOIN follower ON tweet.user_id = follower.follower_user_id

WHERE follower.follower_user_id IN (SELECT (follower.following_user_id)

FROM follower INNER JOIN user ON follower.follower_user_id = user.user_id

WHERE username = "${username}")

AND tweet.tweet_id = ${tweetId};



`;

    const checkUserFollowingUsersTweet = await db.get(
      checkUserFollowingUsersTweetQuery
    );

    if (checkUserFollowingUsersTweet !== undefined) {
      const replyUsersTweetQuery = `

SELECT user.username AS name, reply.reply

FROM user INNER JOIN reply ON user.user_id = reply.user_id

WHERE reply.tweet_id = ${tweetId}

GROUP BY reply.reply_id;

`;

      const replyUsers = await db.all(replyUsersTweetQuery);

      response.send(convertDBToReplyUsernames(replyUsers));
    } else {
      response.status(401);

      response.send("Invalid Request");
    }
  }
);

//Get User Tweets

app.get("/user/tweets/", authenticationToken, async (request, response) => {
  const { username } = request;

  const getUserTweetsQuery = `

SELECT

tweet.tweet,

COUNT(DISTINCT like.user_id) AS likes,

COUNT(DISTINCT reply) AS replies,

tweet.date_time

FROM (tweet LEFT JOIN like ON tweet.tweet_id = like.tweet_id) AS T LEFT JOIN reply ON T.tweet_id = reply.tweet_id

WHERE tweet.tweet_id IN (SELECT tweet.tweet_id FROM tweet NATURAL JOIN user WHERE user.username = "${username}")

GROUP BY tweet.tweet_id;

`;

  const getUserTweets = await db.all(getUserTweetsQuery);

  response.send(
    getUserTweets.map((eachTweet) => convertDBToTweetObj(eachTweet))
  );
});

//User Post Tweet

app.post("/user/tweets/", authenticationToken, async (request, response) => {
  const { username } = request;

  const { tweet } = request.body;

  const now = new Date();

  const postDate = `${now.getFullYear()}-${
    now.getMonth() + 1
  }-${now.getDay()} ${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`;

  const getUserIdQuery = `

SELECT user_id

FROM user

WHERE username = "${username}";

`;

  const user = await db.get(getUserIdQuery);

  const postTweetQuery = `

INSERT INTO tweet(tweet, user_id, date_time)

VALUES (

"${tweet}",

${user.user_id},

"${postDate}");

`;

  const dbResponse = await db.run(postTweetQuery);

  response.send("Created a Tweet");
});

//User Delete Tweet

app.delete(
  "/tweets/:tweetId/",

  authenticationToken,

  async (request, response) => {
    const { username } = request;

    const { tweetId } = request.params;

    const checkTweetQuery = `

SELECT *

FROM tweet NATURAL JOIN user

WHERE user.username = "${username}" AND tweet.tweet_id = ${tweetId};

`;

    const user = await db.get(checkTweetQuery);

    if (user !== undefined) {
      const deleteTweetQuery = `

DELETE FROM tweet

WHERE tweet_id = ${tweetId};

`;

      const dbResponse = await db.run(deleteTweetQuery);

      response.send("Tweet Removed");
    } else {
      response.status(401);

      response.send("Invalid Request");
    }
  }
);

module.exports = app;
