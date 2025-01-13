const { ApolloServer } = require('@apollo/server');
const { startStandaloneServer } = require('@apollo/server/standalone');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
require('dotenv').config();
const { GraphQLError } = require('graphql');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const User = require('./models/user');
const Author = require('./models/author');
const Book = require('./models/book');

const MONGODB_URI = process.env.MONGODB_URI;

console.log('connecting to', MONGODB_URI);

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log('connected to MongoDB');
  })
  .catch((error) => {
    console.log('error connecting to MongoDB:', error.message);
  });

const typeDefs = `
  type User {
  username: String!
  favoriteGenre: String!
  id: ID!
  }

  type Token {
  value: String!
  }

  type Book {
    title: String!
    author: Author!
    published: Int!
    id: ID!
    genres: [String!]!
  }

  type Author {
    name: String!
    born: Int
    id: ID!
    bookCount: Int!
  }

  type Query {
    me: User
    bookCount: Int!
    authorCount: Int!
    allBooks(author: String, genre: String): [Book!]!
    allAuthors: [Author!]!
  }

type Mutation {
  createUser(username: String!, favoriteGenre: String!): User
  login(username: String!, password: String!): Token
  addBook(
    title: String!
    author: String!
    published: Int!
    genres: [String!]!
  ): Book
  editAuthor(name: String!, setBornTo: Int!): Author
}
`;

const resolvers = {
  Query: {
    me: (parent, args, context) => {
      return context.currentUser;
    },
    bookCount: async () => Book.countDocuments(),
    authorCount: async () => Author.countDocuments(),
    allBooks: async (parent, args) => {
      let filter = {};
      if (args.author) {
        const author = await Author.findOne({ name: args.author });
        if (author) {
          filter.author = author._id;
        }
      }
      if (args.genre) {
        filter.genres = args.genre;
      }
      return Book.find(filter).populate('author');
    },
    allAuthors: async () => {
      const authors = await Author.find({});
      return authors;
    },
  },
  Mutation: {
    createUser: async (parent, args) => {
      const passwordHash = await bcrypt.hash('password', 10); // hardcoded password
      const user = new User({ 
        username: args.username,
        favoriteGenre: args.favoriteGenre,
        passwordHash,
      });

      try {
        await user.save();
        return user;
      } catch (error) {
        throw new GraphQLError('User creation failed', {
          extensions: {
            code: 'BAD_USER_INPUT',
            error,
          },
        });
      }
    },

    login: async (parent, args) => {
      const user = await User.findOne({ username: args.username });
      if (!user || !await bcrypt.compare(args.password, user.passwordHash)) {
        throw new GraphQLError('wrong credentials', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      const userForToken = {
        username: user.username,
        id: user._id,
      };

      return { value: jwt.sign(userForToken, process.env.JWT_SECRET) };
    },

    addBook: async (parent, args, context) => {

      if (!context.currentUser) {
        throw new GraphQLError('Not authenticated', {
          extensions: { code: 'UNAUTHORIZED' },
        });
      }
      try {
        let author = await Author.findOne({ name: args.author });

        if (!author) {
          author = new Author({ name: args.author });
          await author.save();
        }

        const book = new Book({
          title: args.title,
          published: args.published,
          author: author._id,
          genres: args.genres,
        });

        await book.save();
        return book.populate('author');
      } catch (error) {
        if (error.name === 'ValidationError') {
          throw new GraphQLError('Failed to add book', {
            extensions: {
              code: 'BAD_USER_INPUT',
              errors: Object.values(error.errors).map((e) => e.message),
            },
          });
        }
        if (error.code === 11000) {
          throw new GraphQLError('Duplicate value error', {
            extensions: {
              code: 'BAD_USER_INPUT',
              details: error.message,
            },
          });
        }
        throw new GraphQLError('Internal server error');
      }
    },

    editAuthor: async (parent, args, context) => {

      if (!context.currentUser) {
        throw new GraphQLError('Not authenticated', {
          extensions: { code: 'UNAUTHORIZED' },
        });
      }

      try {
        const author = await Author.findOne({ name: args.name });

        if (!author) {
          throw new GraphQLError('Author not found', {
            extensions: { code: 'BAD_USER_INPUT' },
          });
        }

        author.born = args.setBornTo;
        await author.save();
        return author;
      } catch (error) {
        if (error.name === 'ValidationError') {
          throw new GraphQLError('Failed to edit author', {
            extensions: {
              code: 'BAD_USER_INPUT',
              errors: Object.values(error.errors).map((e) => e.message),
            },
          });
        }
        throw new GraphQLError('Internal server error');
      }
    },
  },
  Author: {
    bookCount: async (author) => {
      return Book.countDocuments({ author: author._id });
    },
  },
};

// Context: To add token validation to the context of each request
const context = async ({ req }) => {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    const token = auth.substring(7);
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
    const currentUser = await User.findById(decodedToken.id);
    return { currentUser };
  }
};

console.log('Initializing Apollo Server...');
const server = new ApolloServer({
  typeDefs,
  resolvers,
  context,
  introspection: true,
});

startStandaloneServer(server, {
  listen: { port: 4000 },
  context: async () => ({}),
  cors: {
    origin: ["https://studio.apollographql.com", "http://localhost:4000"],
    credentials: true,}
}).then(({ url }) => {
  console.log(`Server ready at ${url}`);
}).catch((error) => {
  console.error('Error starting server:', error);
});
