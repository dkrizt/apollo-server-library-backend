const mongoose = require('mongoose')

// you must install this library

const schema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    unique: true,
    minlength: [3, 'Book title must be at least 3 characters long'],
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Author',
    required: true,
  },
  published: {
    type: Number,
    required: true,
  },
  genres: {
    type: [String],
   /*  validate: {
      validator: (genres) => genres.length > 0,
      message: 'A book must have at least one genre',
    }, */
  },
});

module.exports = mongoose.model('Book', schema)