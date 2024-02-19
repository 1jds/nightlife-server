const express = require("express");
const session = require("express-session");
const passport = require("passport");
const bcrypt = require("bcrypt");
const fetch = require("node-fetch");
const cors = require("cors");
const { Pool } = require("pg");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");

const app = express();
app.use(
  cors({
    origin: "https://nightlifeapp.onrender.com",
  })
);
app.use(bodyParser.json());
// These values need to be updated...
// app.use(
//   session({
//     secret: process.env.SESSION_SECRET,
//     resave: true,
//     key: "express.sid",
//     store: store,
//     saveUninitialized: true,
//     cookie: { secure: false },
//   })
// );
// app.use(passport.initialize());
// app.use(passport.session());

const PORT = process.env.PORT || 3001;
const API_KEY = process.env.YELP_API_KEY;

// Create a PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.ELEPHANTSQL_CONNECTION_URL,
  max: 5,
});

// Test the database connection
pool.connect((err, client, done) => {
  if (err) {
    console.error("Error connecting to the database", err);
  } else {
    console.log("Connected to the database");
  }
});

// Testing CRUD operations
//

app.post("/register", (req, res) => {
  console.log("At POST to /register here is the req.body ..... : ", req.body);
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "Both username and password are required" });
  }

  pool.query(
    "INSERT INTO users (username, password_hash) VALUES ($1, $2)",
    [username, password],
    (err, result) => {
      if (err) {
        console.error("Error inserting user into the database", err);
        res.status(500).json({ error: "Internal server error" });
      } else {
        res.status(201).json({ message: "User created successfully" });
      }
    }
  );
});

app.get("/users", (req, res) => {
  // Use COUNT() to get the total number of users
  pool.query(
    "SELECT COUNT(*) as total_users FROM users; SELECT * FROM users;",
    (err, result) => {
      if (err) {
        console.error("Error executing SQL query", err);
        res.status(500).json({ error: "Internal server error" });
      } else {
        // Extract the count from the first query result
        const totalUsers = result[0].rows[0].total_users;

        // Extract user data from the second query result
        const users = result[1].rows;

        // Create a response object with both the count and user data
        const response = {
          total_users: totalUsers,
          users: users,
        };

        res.json(response);
      }
    }
  );
});

app.put("/users/:id", (req, res) => {
  const userId = req.params.id;
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "Both username and password are required" });
  }

  pool.query(
    "UPDATE users SET username = $1, password = $2 WHERE id = $3",
    [username, password, userId],
    (err, result) => {
      if (err) {
        console.error("Error updating user in the database", err);
        res.status(500).json({ error: "Internal server error" });
      } else {
        res.json({ message: "User updated successfully" });
      }
    }
  );
});

app.delete("/users/:id", (req, res) => {
  const userId = req.params.id;

  pool.query("DELETE FROM users WHERE id = $1", [userId], (err, result) => {
    if (err) {
      console.error("Error deleting user from the database", err);
      res.status(500).json({ error: "Internal server error" });
    } else {
      res.json({ message: "User deleted successfully" });
    }
  });
});

//
//

app.get("/", (req, res) => {
  res.send("Welcome to the nightlife server!");
});

app.post("/yelp-data/:location", async (req, res) => {
  let locationSearchTerm = req.params.location;
  console.log(
    "At POST to /yelp-data/:location here is the req.body ..... : ",
    req.body
  );
  // const { username, password } = req.body;

  const url = `https://api.yelp.com/v3/businesses/search?location=${locationSearchTerm}&sort_by=best_match&limit=5`;
  const options = {
    method: "GET",
    headers: {
      accept: "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
  };

  try {
    const response = await fetch(url, options);

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
  return;
});

const server = app.listen(PORT, () =>
  console.log(`Server is listening on port ${PORT}`)
);

server.keepAliveTimeout = 120 * 1000;
server.headersTimeout = 120 * 1000;
