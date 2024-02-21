const express = require("express");
const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const GitHubStrategy = require("passport-github2").Strategy;
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const AppleStrategy = require("passport-apple").Strategy;
const bcrypt = require("bcrypt");
const fetch = require("node-fetch");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { Pool } = require("pg");
const pgSession = require("connect-pg-simple")(session);
require("dotenv").config();

// --------------------------------------------- //
// -------------  GENERAL SETUP  --------------- //
// --------------------------------------------- //

const app = express();
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.YELP_API_KEY;
app.use(
  cors({
    origin: "https://nightlife-six.vercel.app/", // "http://localhost:5173", // "https://nightlifeapp.onrender.com",
    credentials: true,
    "Access-Control-Allow-Credentials": true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: false })); // Probably won't use this, bust just in case...
app.use(cookieParser());

// --------------------------------------------- //
// -----------  DATABASE CONNECTION  ----------- //
// --------------------------------------------- //

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

// --------------------------------------------- //
// -----------  PASSPORT STRATEGIES  ----------- //
// --------------------------------------------- //

passport.use(
  "local",
  new LocalStrategy((username, password, done) => {
    // Query the PostgreSQL database to find a user by username
    pool.query(
      "SELECT * FROM users WHERE username = $1",
      [username],
      (err, result) => {
        console.log(`User ${username} attempted to log in.`);
        if (err) {
          return done(err);
        }
        // Check if the user exists
        const user = result.rows[0];
        console.log(
          "The user details while authenticating local strategy are... :",
          user
        );
        if (!user) {
          return done(null, false);
        }
        // Check if the password is correct
        if (!bcrypt.compareSync(password, user.password_hash)) {
          return done(null, false);
        }
        // If the username and password are correct, return the user
        console.log(
          "In the local strategy middleware, and everything looks good... Here is the user that we're passing on.... :",
          user
        );
        return done(null, user);
      }
    );
  })
);

// passport.serializeUser((user, done) => {
//   done(null, user.user_id);
// });

// passport.deserializeUser((id, done) => {
//   pool.query("SELECT * FROM users WHERE user_id = $1", [id], (err, result) => {
//     if (err) {
//       return done(err);
//     }
//     const user = result.rows[0];
//     return done(null, user);
//   });
// });

passport.serializeUser((user, done) => {
  console.log(".......... serializeUser was invoked .............");
  done(null, user);
});
passport.deserializeUser((user, done) => {
  console.log(".......... DE deserializeUser was invoked .............");
  done(null, user);
});

// --------------------------------------------- //
// -------------  EXPRESS SESSION  ------------- //
// --------------------------------------------- //

app.use(
  session({
    store: new pgSession({
      pool,
      tableName: "session", // Name of the session table in PostgreSQL
    }),
    secret: process.env.EXPRESS_SESSION_SECRET_KEY,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 14 * 24 * 60 * 60 * 1000, // 14 days session timeout
      // domain: "https://nightlifeapp.onrender.com", // delete?
      // secure: true, // delete?
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

// --------------------------------------------- //
// -----------------  ROUTING  ----------------- //
// --------------------------------------------- //

app.get("/", (req, res) => {
  res.send("Welcome to the nightlife server!");
});

app.get("/current-session", passport.authenticate("session"), (req, res) => {
  // console.log(
  //   "Here is the req.session for /current-session......... :",
  //   req.session,
  //   "Here is the req.session.passport for /current-session......... :",
  //   req.session.passport
  // );
  if (req.isAuthenticated()) {
    console.log("At GET /current-session... Yes, indeed!");
  } else {
    console.log("At GET /current-session... No, not at all!");
  }

  if (!req.user) {
    res.json({ currentlyLoggedIn: false });
  } else {
    res.json({
      currentlyLoggedIn: true,
      userId: req.user.user_id,
      username: req.user.username,
    });
  }
});

app.post("/register", (req, res) => {
  console.log("At POST to /register here is the req.body ..... : ", req.body);
  const { username, password } = req.body;
  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "Both username and password are required" });
  }
  pool.query(
    "SELECT * FROM users WHERE username = $1",
    [username],
    (err, result) => {
      if (err) {
        return done(err);
      }

      const user = result.rows[0];
      if (user) {
        return res.json({ error: "Please select another username" });
      }
    }
  );

  const hashed_password = bcrypt.hashSync(password, 12);
  pool.query(
    "INSERT INTO users (username, password_hash) VALUES ($1, $2)",
    [username, hashed_password],
    (err, result) => {
      if (err) {
        console.error("Error inserting user into the database", err);
        return res.status(500).json({ error: "Internal server error" });
      } else {
        return res.status(201).json({ message: "User created successfully" });
      }
    }
  );
});

app.post("/login", passport.authenticate("local"), (req, res) => {
  console.log("A successful login occurred.");

  if (req.isAuthenticated()) {
    console.log("At POST /login... Yes, indeed!");
  } else {
    console.log("At POST /login... No, not at all!");
  }

  return res.json({
    loginSuccessful: true,
    userId: req.user.user_id,
    username: req.user.username,
  });
});

app.get("/logout", (req, res) => {
  if (req.isAuthenticated()) {
    console.log("At GET /logout... Yes, indeed!");
  } else {
    console.log("At GET /logout... No, not at all!");
  }

  req.logout((err) => {
    if (err) {
      return next(err);
    } else {
      res.json({ logoutSuccessful: true });
    }
  });
});

// app.get("/users", (req, res) => {
//   if (req.isAuthenticated()) {
//     console.log("At GET /users... Yes, indeed!");
//   } else {
//     console.log("At GET /users... No, not at all!");
//   }

//   // Use COUNT() to get the total number of users
//   pool.query(
//     "SELECT COUNT(*) as total_users FROM users; SELECT * FROM users;",
//     (err, result) => {
//       if (err) {
//         console.error("Error executing SQL query", err);
//         res.status(500).json({ error: "Internal server error" });
//       } else {
//         // Extract the count from the first query result
//         const totalUsers = result[0].rows[0].total_users;

//         // Extract user data from the second query result
//         const users = result[1].rows;

//         // Create a response object with both the count and user data
//         const response = {
//           total_users: totalUsers,
//           users: users,
//         };

//         return res.json(response);
//       }
//     }
//   );
// });

// app.put("/users/:id", (req, res) => {
//   const userId = req.params.id;
//   const { username, password } = req.body;

//   if (!username || !password) {
//     return res
//       .status(400)
//       .json({ error: "Both username and password are required" });
//   }

//   pool.query(
//     "UPDATE users SET username = $1, password = $2 WHERE id = $3",
//     [username, password, userId],
//     (err, result) => {
//       if (err) {
//         console.error("Error updating user in the database", err);
//         res.status(500).json({ error: "Internal server error" });
//       } else {
//         res.json({ message: "User updated successfully" });
//       }
//     }
//   );
// });

// app.delete("/users/:id", (req, res) => {
//   const userId = req.params.id;

//   pool.query("DELETE FROM users WHERE id = $1", [userId], (err, result) => {
//     if (err) {
//       console.error("Error deleting user from the database", err);
//       res.status(500).json({ error: "Internal server error" });
//     } else {
//       res.json({ message: "User deleted successfully" });
//     }
//   });
// });

app.post("/yelp-data/:location", async (req, res) => {
  let locationSearchTerm = req.params.location;
  console.log(
    "At POST to /yelp-data/:location here is the req.body ..... : ",
    req.body
  );
  const { searchOffset, searchIsOpenNow, searchSortBy, searchPrice } = req.body;
  let updatedSearchPrice;
  switch (searchPrice) {
    case 1:
      updatedSearchPrice = "&price=1";
      break;
    case 2:
      updatedSearchPrice = "&price=1&price=2";
      break;
    case 3:
      updatedSearchPrice = "&price=1&price=2&price=3";
      break;
    default:
      updatedSearchPrice = "&price=1&price=2&price=3&price=4";
  }

  const url = `https://api.yelp.com/v3/businesses/search?location=${locationSearchTerm}${updatedSearchPrice}&open_now=${searchIsOpenNow}&sort_by=${searchSortBy}&limit=5&offset=${searchOffset}`;
  const options = {
    method: "GET",
    headers: {
      accept: "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
  };
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
  return;
});

// --------------------------------------------- //
// ------------------  SERVER  ----------------- //
// --------------------------------------------- //

const server = app.listen(PORT, () =>
  console.log(`Server is listening on port ${PORT}`)
);

server.keepAliveTimeout = 120 * 1000;
server.headersTimeout = 120 * 1000;
