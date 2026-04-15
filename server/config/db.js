const mongoose = require('mongoose');

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;

  // Try connecting to the configured MongoDB URI first
  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      heartbeatFrequencyMS: 10000,
    });
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    return;
  } catch (error) {
    console.warn(`⚠️  Could not connect to MongoDB at configured URI: ${error.message}`);
    console.log('🔄 Starting in-memory MongoDB for local development...');
  }

  // Fallback: use in-memory MongoDB for development
  try {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    const mongod = await MongoMemoryServer.create();
    const memUri = mongod.getUri();

    const conn = await mongoose.connect(memUri, {
      serverSelectionTimeoutMS: 5000,
    });

    console.log(`✅ In-Memory MongoDB Started: ${conn.connection.host}`);
    console.log('⚠️  Data will NOT persist after restart. Set MONGODB_URI for production.');

    // Store reference for cleanup
    process.mongod = mongod;
  } catch (memError) {
    console.error(`❌ Failed to start in-memory MongoDB: ${memError.message}`);
    console.error('Please install MongoDB or set a valid MONGODB_URI in .env');
    process.exit(1);
  }
};

module.exports = connectDB;
