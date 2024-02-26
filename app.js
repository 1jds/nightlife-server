const express = require("express");
const path = require("path");
const fs = require("fs");
const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const JwtStrategy = require("passport-jwt").Strategy;
const ExtractJwt = require("passport-jwt").ExtractJwt;
const GitHubStrategy = require("passport-github2").Strategy;
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const AppleStrategy = require("passport-apple").Strategy;
const bcrypt = require("bcrypt");
const fetch = require("node-fetch");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { Pool } = require("pg");
const pgSession = require("connect-pg-simple")(session);

// --------------------------------------------- //
// -------------  GENERAL SETUP  --------------- //
// --------------------------------------------- //
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.YELP_API_KEY;
app.use(
  cors({
    origin: "https://nightlife-8ddy.onrender.com", // "https://nightlife-six.vercel.app", // "http://localhost:5173", // "https://nightlifeapp.onrender.com",
    credentials: true,
    "Access-Control-Allow-Credentials": true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: false })); // Probably won't use this, bust just in case...
app.use(cookieParser()); // maybe don't need for JWT

app.use(express.static("dist"));

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

// const options = {
//   // options for JWT Strategy
//   jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
//   secretOrKey: "dummy test key",
//   // algorithms: ["RS256"],
// };

// passport.use(
//   new JwtStrategy(options, (jwt_payload, done) => {
//     console.log(jwt_payload);

//     // Query the PostgreSQL database to find a user by username
//     pool.query(
//       "SELECT * FROM users WHERE username = $1",
//       [jwt_payload.username],
//       (err, result) => {
//         console.log(`User ${jwt_payload.username} attempted to log in.`);
//         if (err) {
//           return done(err);
//         }
//         // Check if the user exists
//         const user = result.rows[0];
//         console.log(
//           "The user details while authenticating jwt strategy are... :",
//           user
//         );
//         if (!user) {
//           return done(null, false);
//         }
//         // Check if the password is correct
//         if (!bcrypt.compareSync(jwt_payload.password, user.password_hash)) {
//           return done(null, false);
//         }
//         // If the username and password are correct, return the user
//         console.log(
//           "In the jwt strategy middleware, and everything looks good... Here is the user that we're passing on.... :",
//           user
//         );
//         return done(null, user);
//       }
//     );
//   })
// );

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

// app.get("/", (req, res) => {
//   res.send("Welcome to the nightlife server!");
// });

app.get("/api/current-session", (req, res) => {
  if (!req.isAuthenticated()) {
    return res.json({ currentlyLoggedIn: false });
  } else {
    // Call our helper function for getting a list of venues the user is attending
    getVenuesAttendingIds(req.user.user_id, (err, venuesAttendingIds) => {
      if (err) {
        return res.send(err);
      } else {
        return res.json({
          currentlyLoggedIn: true,
          userId: req.user.user_id,
          username: req.user.username,
          venuesAttendingIds,
        });
      }
    });
  }
});

// app.get(
//   "/api/current-session",
//   passport.authenticate("session"),
//   (req, res) => {
//     // console.log(
//     //   "Here is the req.session for /current-session......... :",
//     //   req.session,
//     //   "Here is the req.session.passport for /current-session......... :",
//     //   req.session.passport
//     // );
//     if (req.isAuthenticated()) {
//       console.log("At GET /current-session... Yes, indeed!");
//     } else {
//       console.log("At GET /current-session... No, not at all!");
//     }

//     if (!req.user) {
//       res.json({ currentlyLoggedIn: false });
//     } else {
//       pool.query(
//         "SELECT venue_yelp_id FROM venues JOIN users_venues ON venues.venue_id = users_venues.venue_id WHERE users_venues.user_id = $1",
//         [req.user.user_id],
//         (err, result) => {
//           if (err) {
//             return res.send(err);
//           } else {
//             console.log("The result from the query... : ", result);
//             console.log("The type of the result : ", typeof result);
//             console.log("The rows from the query... : ", result.rows);
//             return res.json({
//               currentlyLoggedIn: true,
//               userId: req.user.user_id,
//               username: req.user.username,
//               venuesAttendingIds: result?.rows,
//             });
//           }
//         }
//       );
//     }
//   }
// );

app.post("/api/register", (req, res) => {
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
        return res.send(err);
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

app.post("/api/login", passport.authenticate("local"), (req, res) => {
  if (!req.isAuthenticated()) {
    console.log("Login failed at /api/login");
    return res.json({ currentlyLoggedIn: false });
  } else {
    console.log("A successful login occurred.");
    // Call our helper function for getting a list of venues the user is attending
    getVenuesAttendingIds(req.user.user_id, (err, venuesAttendingIds) => {
      if (err) {
        return res.send(err);
      } else {
        return res.json({
          loginSuccessful: true,
          userId: req.user.user_id,
          username: req.user.username,
          venuesAttendingIds,
        });
      }
    });
  }

  // return res.json({
  //   loginSuccessful: true,
  //   userId: req.user.user_id,
  //   username: req.user.username,
  // });
});

app.get("/api/logout", (req, res) => {
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

// app.get("/api/users", (req, res) => {
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

// app.put("/api/users/:id", (req, res) => {
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

// app.delete("/api/users/:id", (req, res) => {
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

app.post("/api/venues-attending", async (req, res) => {
  if (req.isAuthenticated()) {
    console.log("At POST /venues-attending... Yes, indeed!");
  } else {
    console.log("At POST /venues-attending... No, not at all!");
    res.send("Please login before attempting to access this route.");
  }

  const receivedVenueYelpId = req.body.venueYelpId;
  const receivedUserId = req.body.userId;
  console.log(
    "receivedVenueYelpId at /api/venues-attending",
    receivedVenueYelpId,
    "receivedUserId at /api/venues-attending",
    receivedUserId
  );

  if (!receivedVenueYelpId || !receivedUserId) {
    res.send(
      "Error adding venue to plans. Venue and/or user data not received correctly. Try refreshing the page and searching again, or else log in again."
    );
  }

  const venue_id = null;
  try {
    const receivedVenueDbId = await pool.query(
      "SELECT venue_id FROM venues WHERE venue_yelp_id = $1;",
      [receivedVenueYelpId]
    );

    if (receivedVenueDbId.rowCount === 1) {
      venue_id = receivedVenueDbId.rows[0].venue_id;
    } else if (receivedVenueDbId.rowCount === 0) {
      // We need to insert the yelp id into the venues table, and then select again...
      try {
        const insertNewVenue = await pool.query(
          "INSERT INTO venues (venue_yelp_id) VALUES ($1) ON CONFLICT (venue_yelp_id) DO NOTHING;",
          [receivedVenueYelpId]
        );
        console.log(
          "AND THIS IS WHAT THE insertNewVenue result looks like... :",
          insertNewVenue
        );
        try {
          const venueDbId = await pool.query(
            "SELECT venue_id FROM venues WHERE venue_yelp_id = $1;",
            [receivedVenueYelpId]
          );
          venue_id = venueDbId.rows[0].venue_id;
        } catch (error) {
          console.error(error.message);
        }
      } catch (error) {
        console.error(
          "Error executing query at POST /venues-attending: ",
          error.message
        );
        res.json({
          insertSuccessful: false,
          error: err,
        });
      }
      //     console.log("Query result at POST /venues-attending`: ", result.rows);
      //     res.json({
      //       insertSuccessful: true,
      //       message: `Successfully inserted venue id ${receivedVenueId} into database`,
      //     });
    } else {
      return res.json({
        error: "There are duplicate values in the database causing an error.",
      });
    }

    try {
      console.log(
        "WHAT DOES venue_id look like at this point????? IS IT NULL???? ..... :",
        venue_id
      );
      let result = await pool.query(
        "INSERT INTO users_venues (user_id, venue_id) VALUES ($1, $2);",
        [receivedUserId, receivedVenueDbId.rows[0].venue_id]
      );
      console.log(
        "at /api/venues-attending at INSERT INTO users_venues... :",
        result
      );
      res.json({
        insertSuccessful: true,
        message: `Successfully inserted venue with id ${receivedVenueYelpId} into database`,
      });
    } catch (error) {
      console.error(error.message);
    }
  } catch (error) {
    console.error(
      "Error finding venue_id from venues at /api/venues-attending... :",
      error.message
    );
    res.json({
      insertSuccessful: false,
      error: err,
    });
  }
});

// ------ YELP calls ------
app.get("/api/get-venues-attending/:venueYelpId", async (req, res) => {
  console.log("What does the req.params object looks like? ... : ", req.params);
  console.log(
    "What kind of req.params are coming through at /api/get-venues-attending/:venueYelpId... : ",
    req.params.venueYelpId
  );
  console.log("What is the typeof()?... : ", typeof req.params.venueYelpId);

  const url = `https://api.yelp.com/v3/businesses/${req.params.venueYelpId}`;
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
    console.log("Data received... : ", data);
    return res.json(data);
  } catch (error) {
    console.error("Error fetching data:", error);
    return res.send(error);
  }
});

app.post("/api/yelp-data/:location", async (req, res) => {
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
// -------------  HELPER FUNCTIONS  ------------ //
// --------------------------------------------- //

// Helper function to get a list of all of the venues a given user is attending
function getVenuesAttendingIds(userId, callback) {
  pool.query(
    "SELECT venue_yelp_id FROM venues JOIN users_venues ON venues.venue_id = users_venues.venue_id WHERE users_venues.user_id = $1",
    [userId],
    (err, result) => {
      if (err) {
        callback(err, null);
      } else {
        const venuesAttendingStrArr = result?.rows.map(
          (item) => item.venue_yelp_id
        );
        callback(null, venuesAttendingStrArr);
      }
    }
  );
}

// --------------------------------------------- //
// ------------------  SERVER  ----------------- //
// --------------------------------------------- //

const server = app.listen(PORT, () =>
  console.log(`Server is listening on port ${PORT}`)
);

server.keepAliveTimeout = 120 * 1000;
server.headersTimeout = 120 * 1000;
