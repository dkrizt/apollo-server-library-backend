const mongoose = require('mongoose')

const schema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    minlength: [3, 'Author name must be at least 3 characters long'],
  },
  born: {
    type: Number,
    min: [0, 'Year of birth cannot be negative'],
  },
});

module.exports = mongoose.model('Author', schema)