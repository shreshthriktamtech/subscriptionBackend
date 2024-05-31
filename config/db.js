
var mongoose = require('mongoose');
var mongoDB = process.env.MONGODB_URI
mongoose.connect(mongoDB);
var db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.on('error', console.error.bind(console, 'MongoDB connection error:'));