const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");

const app = express();
app.use(
  cors({
    origin: "https://nightlifeapp.onrender.com",
  })
);

const PORT = process.env.PORT || 3001;
const API_KEY = process.env.YELP_API_KEY;

app.get("/yelp-data", async (req, res) => {
  const locationSearchTerm = "London";

  const url = `https://api.yelp.com/v3/businesses/search?location=${locationSearchTerm}&sort_by=best_match&limit=20`;
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
