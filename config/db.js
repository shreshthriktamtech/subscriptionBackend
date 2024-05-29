
var mongoose = require('mongoose');
var mongoDB = 'mongodb+srv://shreshth:8aCUanyUiPsPZKcw@local.o16bqnl.mongodb.net/subscribe?retryWrites=true&w=majority&appName=Local';
mongoose.connect(mongoDB);
var db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.on('error', console.error.bind(console, 'MongoDB connection error:'));