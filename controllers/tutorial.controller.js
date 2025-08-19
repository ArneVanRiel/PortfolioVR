const Tutorial = require("../models/tutorial.model.js");

// Create and Save a new Tutorial
exports.create = (req, res) => {
  
};

// Retrieve all Tutorials from the database (with condition).
exports.findAll = (req, res) => {
    const tutorial = req.query.tutorial;
  
    Tutorial.getAll(tutorial, (err, data) => {
      if (err)
        res.status(500).send({
          message:
            err.message || "Some error occurred while retrieving tutorials."
        });
      else res.send(data);
    });
  };

// Find a single Tutorial with a id
exports.findOne = (req, res) => {
  
};

// find all tickers die voldoen aan snelle test
exports.findAllTickersFastTest = (req, res) => {
  const ticker = req.query.ticker;

  Tutorial.getTickersFastTest(ticker, (err,data) => {
    if (err)
    res.status(500).send({
      message:
        err.message || "Some error occurred while retrieving tickers."
    });
  else res.send(data);
  });

}

// find all published Tutorials
exports.findAllPublished = (req, res) => {
  
};

// Update a Tutorial identified by the id in the request
exports.update = (req, res) => {
  
};

// Delete a Tutorial with the specified id in the request
exports.delete = (req, res) => {
  
};

// Delete all Tutorials from the database.
exports.deleteAll = (req, res) => {
  
};