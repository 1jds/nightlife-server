const express = require("express");
const path = require("path");
const fs = require("fs");
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

// --------------------------------------------- //
// -------------  GENERAL SETUP  --------------- //
// --------------------------------------------- //
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.YELP_API_KEY;
// ------------------- CORS ------------------- //
const acceptedOrigins = [
  /^https:\/\/github\.com.*/,
  /^https:\/\/nightlife-8ddy\.onrender\.com.*/,
];
app.use(
  cors({
    origin: acceptedOrigins,
    credentials: true,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"],
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: false })); // Probably won't use this...
app.use(cookieParser());

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

// ---------- Local Strategy ---------- //
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

// ---------- GitHub Strategy ---------- //
//   Strategies in Passport require a `verify` function, which accept
//   credentials (in this case, an accessToken, refreshToken, and GitHub
//   profile), and invoke a callback with a user object.
passport.use(
  "github",
  new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL:
        "https://nightlife-8ddy.onrender.com/api/login/github/callback",
    },
    async function (accessToken, refreshToken, profile, done) {
      console.log(
        "what does the profile returned for the GitHub strategy look like?",
        profile
      );
      // Query the PostgreSQL database to find a user by username.
      // Of course, this will not link to an already existing user account in the
      // database, unless the user has used the same username in both places.
      const userDbObj = await pool.query(
        "SELECT * FROM users WHERE username = $1",
        [profile.username]
      );
      if (!userDbObj.rows[0]) {
        console.log(
          "This is what the userDbObj looks like before return done... :",
          userDbObj
        );
        const dbUser = insertNewUserIntoDb(profile.username, profile.username);
        return done(null, dbUser);
      }
      return done(null, userDbObj);
    }
  )
);

// SWITCH THIS BACK AGAIN TO USING JUST THE USER ID FROM THE DB AT A LATER STAGE...
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
//   res.json({message: "Welcome to the nightlife server!"});
// });

app.get("/api/current-session", (req, res) => {
  if (!req.isAuthenticated()) {
    return res.json({ currentlyLoggedIn: false });
  } else {
    // Call our helper function for getting a list of venues the user is attending
    getVenuesAttendingIds(req.user.user_id, (err, venuesAttendingIds) => {
      if (err) {
        return res.json({ err });
      } else {
        console.log(
          "Here is the req.user at /api/current-session... : ",
          req.user
        );
        return res.json({
          currentlyLoggedIn: true,
          userId: req.user.user_id || req.user.rows[0].user_id,
          username: req.user.username || req.user.rows[0].username,
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
//             return res.json({err});
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
        return res.json({ err });
      } else {
        const user = result.rows[0];
        if (user) {
          return res.json({ error: "Please select another username" });
        }
      }
    }
  );
  const dbUser = insertNewUserIntoDb(username, password);
  if (dbUser) {
    return res.status(201).json({ message: "User created successfully" });
  } else {
    return res.status(500).json({ error: "Internal server error" });
  }
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
        return res.json({ err });
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
});

// app.get("/api/login/github", passport.authenticate("github"), (req, res) => {
//   if (!req.isAuthenticated()) {
//     console.log("Login failed at /api/login/github");
//     return res.json({ currentlyLoggedIn: false });
//   } else {
//     console.log("A successful login occurred.");
//     // Call our helper function for getting a list of venues the user is attending
//     getVenuesAttendingIds(req.user.user_id, (err, venuesAttendingIds) => {
//       if (err) {
//         return res.json({ err });
//       } else {
//         return res.json({
//           loginSuccessful: true,
//           userId: req.user.user_id,
//           username: req.user.username,
//           venuesAttendingIds,
//         });
//       }
//     });
//   }
// });

app.get(
  "/api/login/github",
  passport.authenticate("github", { scope: ["read:user"] })
);

app.get(
  "/api/login/github/callback",
  passport.authenticate("github", { failureRedirect: "/" }),
  (req, res) => {
    res.redirect("/");
    // if (!req.isAuthenticated()) {
    //   console.log("Login failed at /api/login/github");
    //   return res.json({ currentlyLoggedIn: false });
    // } else {
    //   console.log("A successful login occurred.");
    //   // Call our helper function for getting a list of venues the user is attending
    //   getVenuesAttendingIds(req.user.user_id, (err, venuesAttendingIds) => {
    //     if (err) {
    //       return res.json({ err });
    //     } else {
    //       return res.json({
    //         loginSuccessful: true,
    //         userId: req.user.user_id,
    //         username: req.user.username,
    //         venuesAttendingIds,
    //       });
    //     }
    //   });
    // }
  }
);

// app.get(
//   "/auth/github",
//   passport.authenticate("github", { scope: ["user:email"] })
// );

// app.get(
//   "/auth/github/callback",
//   passport.authenticate("github", { failureRedirect: "/login" }),
//   function (req, res) {
//     // Successful authentication, redirect home.
//     res.redirect("/");
//   }
// );

// app.get("/api/login/google", (req, res) => {
//   Yet to be set up...
// })

// app.get("/api/login/apple", (req, res) => {
//   Yet to be set up...
// })

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
  if (!req.isAuthenticated()) {
    console.log("At POST /venues-attending... Not authenticated");
    res.json({
      message: "Please login before attempting to access this route.",
    });
  }

  const receivedVenueYelpId = req.body.venueYelpId;
  const receivedUserId = req.body.userId;
  if (!receivedVenueYelpId || !receivedUserId) {
    res.json({
      error:
        "Error adding venue to plans. Venue and/or user data not received correctly. Try refreshing the page and searching again, or else log in again.",
    });
  }
  const client = await pool.connect();
  let venue_id = null;
  try {
    await client.query("BEGIN");
    const receivedVenueDbId = await client.query(
      "SELECT venue_id FROM venues WHERE venue_yelp_id = $1;",
      [receivedVenueYelpId]
    );
    if (receivedVenueDbId.rowCount === 1) {
      venue_id = receivedVenueDbId.rows[0].venue_id;
    } else {
      const insertNewVenue = await client.query(
        "INSERT INTO venues (venue_yelp_id) VALUES ($1) RETURNING venue_id;",
        [receivedVenueYelpId]
      );
      venue_id = insertNewVenue.rows[0].venue_id;
    }
    let result = await client.query(
      "INSERT INTO users_venues (user_id, venue_id) VALUES ($1, $2);",
      [receivedUserId, venue_id]
    );
    await client.query("COMMIT");
    return res.json({
      insertSuccessful: true,
      message: `Successfully inserted venue with id ${receivedVenueYelpId} into database`,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(
      "Error finding venue_id from venues at /api/venues-attending... :",
      error.message
    );
    return res.json({
      insertSuccessful: false,
      error,
    });
  } finally {
    client.release();
  }
});

app.post("/api/venue-remove", async (req, res) => {
  if (!req.isAuthenticated()) {
    console.log("At POST /venues-attending/remove... Not authenticated");
    res.json({
      message: "Please login before attempting to access this route.",
    });
  }

  const receivedVenueYelpId = req.body.venueYelpId;
  const receivedUserId = req.body.userId;
  if (!receivedVenueYelpId || !receivedUserId) {
    return res.json({
      error:
        "Error adding venue to plans. Venue and/or user data not received correctly. Try refreshing the page and searching again, or else log in again.",
    });
  }

  const client = await pool.connect();
  try {
    const receivedVenueDbId = await client.query(
      "SELECT venue_id FROM venues WHERE venue_yelp_id = $1;",
      [receivedVenueYelpId]
    );
    const resultOfRemove = await client.query(
      "DELETE FROM users_venues WHERE user_id = $1 AND venue_id = $2;",
      [receivedUserId, receivedVenueDbId.rows[0].venue_id]
    );
    await client.query("COMMIT");
    return res.json({
      removeSuccessful: true,
      message: `Successfully removed venue with id ${receivedVenueYelpId} from database`,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(
      "Error finding venue_id from venues at /api/venues-attending/remove... :",
      error.message
    );
    return res.json({
      removeSuccessful: false,
      error: err,
    });
  } finally {
    client.release();
  }
});

app.get("/api/number-attending/:yelpId", async (req, res) => {
  if (!req.isAuthenticated()) {
    console.log("At POST /number-attending... Not authenticated");
    res.json({
      message: "Please login before attempting to access this route.",
    });
  }
  const yelpId = req.params.yelpId;
  try {
    const venue_id = await pool.query(
      "SELECT venue_id FROM venues WHERE venue_yelp_id = $1;",
      [yelpId]
    );
    console.log(
      "HERE IS THE RESULTS VALUE I'M INTERESTED IN... venue_id",
      venue_id
    );
    return res.json({ venue_id });
    // const attendingCount = await pool.query(
    //   "SELECT COUNT(*) FROM users_venues WHERE venue_id = $1;",
    //   [venue_id.rows[0]]
    // );
    // return res.json({
    //   countAttendeesSuccessful: true,
    //   attendingCount,
    // });
  } catch (error) {
    console.error(
      "Error counting venue attendees at /api/number-attending... :",
      error.message
    );
    return res.json({
      countAttendeesSuccessful: false,
      error: error,
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
    return res.json({ error });
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
    if (response.status === 400) {
      res.status(400).json({
        locationFound: false,
        message:
          "No venue information was found for that location, please try searching another locality.",
      });
    }
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

// Helper function to insert a new user into the database
function insertNewUserIntoDb(username, password) {
  const hashed_password = bcrypt.hashSync(password, 12);
  pool.query(
    "INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING *",
    [username, hashed_password],
    (err, result) => {
      if (err) {
        console.error("Error inserting user into the database", err);
      } else {
        return result;
      }
    }
  );
}

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
